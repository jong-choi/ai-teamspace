from __future__ import annotations

import json
from collections.abc import AsyncIterator, Mapping
from pathlib import Path
from typing import Any

import pytest
from langgraph_sdk.schema import StreamMode

from config.models import DeepEvalAsyncMode, HarnessLimits
from datasets.schema import EvalCase
from fixtures.lifecycle import FixtureLease
from runner.agent_protocol_executor import AgentProtocolExecutor
from runner.trajectory import ToolSource, TrajectoryEventKind
from scorers.deterministic import score_deterministic
from scorers.models import FailureType


def limits() -> HarnessLimits:
    return HarnessLimits(
        max_concurrency=4,
        case_timeout_seconds=30,
        max_turns=4,
        max_tool_calls=8,
        max_subagents=4,
        max_cost=1,
        deepeval_batch_size=4,
        deepeval_async_mode=DeepEvalAsyncMode.SYNC,
        trials=1,
        random_seed=1,
    )


def lease() -> FixtureLease:
    return FixtureLease(
        owner="run-1:case-1",
        persona_alias="operator",
        organization_alias="org",
        public_ids={"organization:org": "org-1"},
    )


class FakeAgentClient:
    def __init__(
        self,
        *,
        runs: list[dict[str, Any]],
        streams: Mapping[str, list[object] | Exception],
        states: list[dict[str, Any]] | None = None,
    ) -> None:
        self._runs_to_create = list(runs)
        self._streams = dict(streams)
        self._states = list(states or [])
        self.created: list[dict[str, object]] = []

    async def create_thread(
        self,
        *,
        thread_id: str | None = None,
    ) -> Mapping[str, Any]:
        return {"thread_id": thread_id or "thread-1"}

    async def create_run(
        self,
        thread_id: str,
        assistant_id: str,
        *,
        input: Mapping[str, Any] | None = None,
        command: Mapping[str, Any] | None = None,
        stream_mode: StreamMode | list[StreamMode] = "values",
        stream_subgraphs: bool = False,
        config: Mapping[str, Any] | None = None,
    ) -> Mapping[str, Any]:
        self.created.append(
            {
                "thread_id": thread_id,
                "assistant_id": assistant_id,
                "input": input,
                "command": command,
                "stream_mode": stream_mode,
                "stream_subgraphs": stream_subgraphs,
                "config": config,
            }
        )
        if not self._runs_to_create:
            raise AssertionError("unexpected create_run")
        return self._runs_to_create.pop(0)

    async def resume_stream(
        self,
        thread_id: str,
        run_id: str,
        *,
        last_event_id: str | None = None,
        stream_mode: StreamMode | list[StreamMode] | None = None,
    ) -> AsyncIterator[Any]:
        del thread_id, last_event_id, stream_mode
        stream = self._streams[run_id]
        if isinstance(stream, Exception):
            raise stream
        for part in stream:
            yield part

    async def get_run(
        self,
        thread_id: str,
        run_id: str,
    ) -> Mapping[str, Any]:
        del thread_id
        statuses = {
            "run-1": "success",
            "run-interrupted": "interrupted",
            "run-resume": "success",
            "run-error": "error",
        }
        return {"run_id": run_id, "status": statuses[run_id]}

    async def get_state(
        self,
        thread_id: str,
        *,
        subgraphs: bool = False,
    ) -> Mapping[str, Any]:
        del thread_id, subgraphs
        if not self._states:
            return {"tasks": []}
        return self._states.pop(0)


def event(
    kind: str,
    *,
    name: str,
    run_id: str,
    data: Mapping[str, object] | None = None,
) -> dict[str, object]:
    return {
        "event": "events",
        "data": {
            "event": kind,
            "name": name,
            "run_id": run_id,
            "data": dict(data or {}),
        },
    }


def values(*, content: str) -> dict[str, object]:
    return {
        "event": "values",
        "data": {
            "messages": [
                {
                    "type": "ai",
                    "content": content,
                }
            ]
        },
    }


async def test_executor_collects_nested_public_events_without_raw_tool_result() -> None:
    client = FakeAgentClient(
        runs=[{"run_id": "run-1"}],
        streams={
            "run-1": [
                event(
                    "on_tool_start",
                    name="task",
                    run_id="subagent-1",
                    data={
                        "input": {
                            "subagent_type": "researcher",
                            "description": "find the ticket",
                        }
                    },
                ),
                event(
                    "on_tool_start",
                    name="get_ticket",
                    run_id="tool-1",
                    data={
                        "input": {
                            "organizationId": "org-1",
                            "ticketId": "ticket-1",
                        }
                    },
                ),
                event(
                    "on_tool_end",
                    name="get_ticket",
                    run_id="tool-1",
                    data={"output": {"secret": "must-not-enter-trajectory"}},
                ),
                event(
                    "on_tool_end",
                    name="task",
                    run_id="subagent-1",
                ),
                event(
                    "on_chat_model_end",
                    name="model",
                    run_id="model-1",
                    data={"output": {"type": "ai", "content": "Ticket found."}},
                ),
                values(content="Ticket found."),
            ]
        },
    )
    case = EvalCase.model_validate(
        {
            "id": "nested-read",
            "version": "1.0.0",
            "input": ["find the ticket"],
            "persona": "operator",
            "expected_tools": {"mode": "exact", "tools": ["get_ticket"]},
            "argument_assertions": [
                {
                    "tool": "get_ticket",
                    "path": "organizationId",
                    "operator": "exact",
                    "value": "org-1",
                }
            ],
        }
    )
    executor = AgentProtocolExecutor(
        lambda _: client,
        teamspace_tool_names=frozenset({"get_ticket"}),
    )

    trajectory = await executor.execute(case, lease())

    assert trajectory.run_ids == ["run-1"]
    assert trajectory.run_statuses == ["success"]
    assert trajectory.subagents == 1
    assert trajectory.final_response == "Ticket found."
    assert trajectory.tool_names() == ["get_ticket"]
    assert trajectory.tools_called[0].source == ToolSource.TEAMSPACE
    assert trajectory.tools_called[0].arguments == {
        "organizationId": "org-1",
        "ticketId": "ticket-1",
    }
    assert "must-not-enter-trajectory" not in trajectory.model_dump_json()
    assert score_deterministic(case, trajectory, limits()).passed


async def test_executor_resumes_hitl_edit_as_a_new_run() -> None:
    client = FakeAgentClient(
        runs=[
            {"run_id": "run-interrupted"},
            {"run_id": "run-resume"},
        ],
        streams={
            "run-interrupted": [
                event(
                    "on_chat_model_end",
                    name="model",
                    run_id="model-1",
                    data={
                        "output": {
                            "type": "ai",
                            "content": "",
                            "tool_calls": [
                                {
                                    "name": "update_ticket",
                                    "args": {
                                        "id": "ticket-1",
                                        "title": "Original",
                                    },
                                }
                            ],
                        }
                    },
                )
            ],
            "run-resume": [
                event(
                    "on_tool_start",
                    name="update_ticket",
                    run_id="tool-1",
                    data={
                        "input": {
                            "id": "ticket-1",
                            "title": "Edited",
                        }
                    },
                ),
                event(
                    "on_tool_end",
                    name="update_ticket",
                    run_id="tool-1",
                ),
                values(content="Updated."),
            ],
        },
        states=[
            {
                "tasks": [
                    {
                        "interrupts": [
                            {
                                "value": {
                                    "actionRequests": [
                                        {
                                            "name": "update_ticket",
                                            "args": {
                                                "id": "ticket-1",
                                                "title": "Original",
                                            },
                                        }
                                    ]
                                }
                            }
                        ]
                    }
                ]
            }
        ],
    )
    case = EvalCase.model_validate(
        {
            "id": "hitl-edit-exec",
            "version": "1.0.0",
            "input": ["change the title"],
            "persona": "operator",
            "expected_tools": {
                "mode": "exact",
                "tools": ["update_ticket"],
            },
            "expected_interrupts": [
                {
                    "decision": "edit",
                    "before_tool": "update_ticket",
                    "edited_arguments": {
                        "id": "ticket-1",
                        "title": "Edited",
                    },
                }
            ],
        }
    )
    executor = AgentProtocolExecutor(lambda _: client)

    trajectory = await executor.execute(case, lease())

    assert trajectory.run_ids == ["run-interrupted", "run-resume"]
    assert trajectory.run_statuses == ["interrupted", "success"]
    assert client.created[1]["input"] is None
    assert client.created[1]["command"] == {
        "resume": {
            "decisions": [
                {
                    "type": "edit",
                    "editedAction": {
                        "name": "update_ticket",
                        "args": {
                            "id": "ticket-1",
                            "title": "Edited",
                        },
                    },
                }
            ]
        }
    }
    kinds = [item.kind for item in trajectory.events]
    assert kinds.index(TrajectoryEventKind.INTERRUPT) < kinds.index(
        TrajectoryEventKind.DECISION
    )
    assert kinds.index(TrajectoryEventKind.DECISION) < kinds.index(
        TrajectoryEventKind.TOOL_CALL
    )
    assert score_deterministic(case, trajectory, limits()).passed


async def test_executor_does_not_resume_an_unexpected_interrupt() -> None:
    client = FakeAgentClient(
        runs=[{"run_id": "run-interrupted"}],
        streams={"run-interrupted": []},
        states=[
            {
                "tasks": [
                    {
                        "interrupts": [
                            {
                                "value": {
                                    "action_requests": [
                                        {
                                            "action_name": "delete_ticket",
                                            "args": {"id": "ticket-1"},
                                        }
                                    ]
                                }
                            }
                        ]
                    }
                ]
            }
        ],
    )
    case = EvalCase(
        id="unexpected-interrupt-exec",
        version="1.0.0",
        input=["read the ticket"],
        persona="operator",
    )
    executor = AgentProtocolExecutor(lambda _: client)

    trajectory = await executor.execute(case, lease())

    assert len(client.created) == 1
    assert trajectory.run_statuses == ["interrupted"]
    failures = score_deterministic(case, trajectory, limits()).failures()
    assert FailureType.HITL_FAILURE in [
        failure.failure_type for failure in failures
    ]


async def test_terminal_product_error_is_returned_as_trajectory_not_infrastructure() -> None:
    client = FakeAgentClient(
        runs=[{"run_id": "run-error"}],
        streams={"run-error": RuntimeError("stream ended with product error")},
    )
    case = EvalCase(
        id="product-error-exec",
        version="1.0.0",
        input=["do it"],
        persona="operator",
    )
    executor = AgentProtocolExecutor(lambda _: client)

    trajectory = await executor.execute(case, lease())

    assert trajectory.run_statuses == ["error"]
    failures = score_deterministic(case, trajectory, limits()).failures()
    assert FailureType.TOOL_EXECUTION_FAILURE in [
        failure.failure_type for failure in failures
    ]


def tool_case(**extra: object) -> EvalCase:
    return EvalCase.model_validate(
        {
            "id": "tool-case",
            "version": "1.0.0",
            "input": ["rename the ticket"],
            "persona": "operator",
            **extra,
        }
    )


async def test_executor_sends_client_context_with_fixture_ids_resolved() -> None:
    client = FakeAgentClient(
        runs=[{"run_id": "run-1"}],
        streams={"run-1": [values(content="done")]},
    )
    case = tool_case(
        client_context={
            "time_zone": "Asia/Seoul",
            "route": "/projects/[projectId]",
            "params": {"projectId": "$organization:org", "tab": "board"},
        }
    )

    await AgentProtocolExecutor(lambda _: client).execute(case, lease())

    assert client.created[0]["config"] == {
        "configurable": {
            "client_context": {
                "timeZone": "Asia/Seoul",
                "route": "/projects/[projectId]",
                "params": {"projectId": "org-1", "tab": "board"},
            }
        }
    }


async def test_executor_rejects_client_context_with_unknown_fixture() -> None:
    client = FakeAgentClient(runs=[], streams={})
    case = tool_case(client_context={"params": {"ticketId": "$ticket:missing"}})

    with pytest.raises(ValueError, match="unknown fixture"):
        await AgentProtocolExecutor(lambda _: client).execute(case, lease())


async def test_executor_counts_tool_message_error_status_as_tool_error() -> None:
    client = FakeAgentClient(
        runs=[{"run_id": "run-1"}],
        streams={
            "run-1": [
                event(
                    "on_tool_start",
                    name="get_ticket",
                    run_id="tool-1",
                    data={"input": {"ticketId": "not-a-uuid"}},
                ),
                event(
                    "on_tool_end",
                    name="get_ticket",
                    run_id="tool-1",
                    data={
                        "output": {
                            "type": "tool",
                            "status": "error",
                            "content": "Invalid uuid",
                        }
                    },
                ),
                values(content="failed"),
            ]
        },
    )

    trajectory = await AgentProtocolExecutor(lambda _: client).execute(
        tool_case(), lease()
    )

    assert [call.is_error for call in trajectory.tools_called] == [True]
    assert TrajectoryEventKind.TOOL_ERROR in [
        item.kind for item in trajectory.events
    ]


async def test_executor_writes_local_raw_trace_with_arguments_and_outputs(
    tmp_path: Path,
) -> None:
    client = FakeAgentClient(
        runs=[{"run_id": "run-1"}],
        streams={
            "run-1": [
                event(
                    "on_chat_model_end",
                    name="model",
                    run_id="model-1",
                    data={
                        "output": {
                            "type": "ai",
                            "content": "",
                            "tool_calls": [
                                {"name": "get_ticket", "args": {"ticketId": "t-1"}}
                            ],
                            "usage_metadata": {
                                "input_tokens": 1200,
                                "output_tokens": 30,
                            },
                        }
                    },
                ),
                event(
                    "on_tool_start",
                    name="get_ticket",
                    run_id="tool-1",
                    data={"input": {"ticketId": "t-1"}},
                ),
                event(
                    "on_tool_end",
                    name="get_ticket",
                    run_id="tool-1",
                    data={"output": {"type": "tool", "content": "ticket body"}},
                ),
                values(content="Ticket found."),
            ]
        },
    )

    trajectory = await AgentProtocolExecutor(
        lambda _: client,
        raw_dir=tmp_path,
    ).execute(tool_case(), lease())

    raw = json.loads((tmp_path / "tool-case.case-1.json").read_text(encoding="utf-8"))
    assert raw["tool_calls"] == [
        {
            "sequence": trajectory.tools_called[0].sequence,
            "name": "get_ticket",
            "source": "unknown",
            "arguments": {"ticketId": "t-1"},
            "is_error": False,
            "result_category": "success",
            "output": "ticket body",
        }
    ]
    assert raw["model_calls"][0]["input_tokens"] == 1200
    assert raw["model_calls"][0]["tool_calls"] == [
        {"name": "get_ticket", "args": {"ticketId": "t-1"}}
    ]
    assert raw["final_response"] == "Ticket found."
