from __future__ import annotations

from collections.abc import AsyncIterator, Callable, Mapping
from dataclasses import dataclass
from pathlib import Path
from time import perf_counter
from typing import Any, Protocol, cast

from langgraph_sdk.schema import StreamMode

from clients.agent_protocol import AgentProtocolClient
from datasets.schema import EvalCase, InterruptExpectation
from fixtures.lifecycle import FixtureLease, resolve_fixture_reference
from runner.raw_trace import RAW_TEXT_LIMIT, write_raw_trace
from runner.trajectory import (
    ObservedToolCall,
    ObservedTrajectory,
    ToolSource,
    TrajectoryEvent,
    TrajectoryEventKind,
)

_STREAM_MODES: list[StreamMode] = ["events", "values"]
# 실패한 쓰기 호출을 고쳐 다시 제안하면 같은 승인을 몇 번까지 되풀이해 회복 과정을 관측한다.
_MAX_RETRY_APPROVAL_ROUNDS = 2
_TERMINAL_STATUSES = frozenset(
    {"success", "error", "timeout", "interrupted", "cancelled"}
)


class AgentExecutionClient(Protocol):
    async def create_thread(
        self,
        *,
        thread_id: str | None = None,
    ) -> Mapping[str, Any]: ...

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
    ) -> Mapping[str, Any]: ...

    def resume_stream(
        self,
        thread_id: str,
        run_id: str,
        *,
        last_event_id: str | None = None,
        stream_mode: StreamMode | list[StreamMode] | None = None,
    ) -> AsyncIterator[Any]: ...

    async def get_run(
        self,
        thread_id: str,
        run_id: str,
    ) -> Mapping[str, Any]: ...

    async def get_state(
        self,
        thread_id: str,
        *,
        subgraphs: bool = False,
    ) -> Mapping[str, Any]: ...


@dataclass
class _PendingTool:
    sequence: int
    name: str
    source: ToolSource
    arguments: dict[str, Any]
    is_error: bool = False
    result_category: str | None = None


@dataclass(frozen=True)
class _InterruptAction:
    name: str
    arguments: dict[str, Any]


class _Collector:
    def __init__(
        self,
        *,
        teamspace_tool_names: frozenset[str],
    ) -> None:
        self._teamspace_tool_names = teamspace_tool_names
        self.sequence = 0
        self.events: list[TrajectoryEvent] = []
        self.completed_tools: list[ObservedToolCall] = []
        self.pending_tools: dict[str, _PendingTool] = {}
        self.subagents = 0
        self.tool_outputs: dict[int, str] = {}
        self.model_calls: list[dict[str, Any]] = []
        self.final_response: str | None = None
        self.last_values: Mapping[str, Any] | None = None

    def add_event(
        self,
        kind: TrajectoryEventKind,
        *,
        name: str | None = None,
        attributes: Mapping[str, str | int | float | bool | None] | None = None,
    ) -> int:
        self.sequence += 1
        self.events.append(
            TrajectoryEvent(
                sequence=self.sequence,
                kind=kind,
                name=name,
                attributes=dict(attributes or {}),
            )
        )
        return self.sequence

    def consume_part(self, part: object) -> None:
        event = _part_field(part, "event")
        data = _part_field(part, "data")
        if event == "events":
            self._consume_graph_event(data)
            return
        if event == "values" and isinstance(data, Mapping):
            self.last_values = cast(Mapping[str, Any], data)
            visible = _last_assistant_text(self.last_values)
            if visible:
                self.final_response = visible

    def _consume_graph_event(self, raw: object) -> None:
        if not isinstance(raw, Mapping):
            return
        event = cast(Mapping[str, Any], raw)
        kind = event.get("event")
        name = event.get("name")
        run_id = event.get("run_id")
        if not isinstance(kind, str):
            return
        tool_name = name if isinstance(name, str) and name else None
        event_run_id = run_id if isinstance(run_id, str) and run_id else None
        data = event.get("data")
        event_data: Mapping[str, Any] = (
            cast(Mapping[str, Any], data)
            if isinstance(data, Mapping)
            else cast(Mapping[str, Any], {})
        )

        if kind == "on_tool_start" and tool_name is not None:
            raw_input: object = event_data.get("input")
            arguments = _mapping_copy(raw_input)
            if tool_name == "task":
                self.subagents += 1
                subagent_name = _scalar_string(arguments.get("subagent_type"))
                self.add_event(
                    TrajectoryEventKind.SUBAGENT_START,
                    name=subagent_name or "task",
                )
                if event_run_id is not None:
                    self.pending_tools[event_run_id] = _PendingTool(
                        sequence=self.sequence,
                        name="task",
                        source=ToolSource.UNKNOWN,
                        arguments=arguments,
                    )
                return

            sequence = self.add_event(
                TrajectoryEventKind.TOOL_CALL,
                name=tool_name,
            )
            key = event_run_id or f"tool:{sequence}"
            self.pending_tools[key] = _PendingTool(
                sequence=sequence,
                name=tool_name,
                source=self._source_for(tool_name),
                arguments=arguments,
            )
            return

        if kind in {"on_tool_end", "on_tool_error"} and tool_name is not None:
            pending = (
                self.pending_tools.pop(event_run_id, None)
                if event_run_id is not None
                else None
            )
            if tool_name == "task":
                self.add_event(
                    TrajectoryEventKind.SUBAGENT_END,
                    name="task",
                )
                return

            # MCP tool은 실패를 예외가 아니라 status=error인 tool message로 돌려준다.
            failed = kind == "on_tool_error" or _tool_reported_error(
                event_data.get("output")
            )
            output_text = _tool_output_text(
                event_data.get("error")
                if kind == "on_tool_error"
                else event_data.get("output")
            )

            if pending is None:
                sequence = self.add_event(
                    TrajectoryEventKind.TOOL_ERROR
                    if failed
                    else TrajectoryEventKind.TOOL_RESULT,
                    name=tool_name,
                )
                if output_text:
                    self.tool_outputs[sequence] = output_text
                self.completed_tools.append(
                    ObservedToolCall(
                        sequence=sequence,
                        name=tool_name,
                        source=self._source_for(tool_name),
                        arguments={},
                        is_error=failed,
                        result_category="error" if failed else "success",
                    )
                )
                return

            pending.is_error = failed
            pending.result_category = "error" if pending.is_error else "success"
            if output_text:
                self.tool_outputs[pending.sequence] = output_text
            self.add_event(
                TrajectoryEventKind.TOOL_ERROR
                if pending.is_error
                else TrajectoryEventKind.TOOL_RESULT,
                name=pending.name,
            )
            self.completed_tools.append(
                ObservedToolCall(
                    sequence=pending.sequence,
                    name=pending.name,
                    source=pending.source,
                    arguments=pending.arguments,
                    is_error=pending.is_error,
                    result_category=pending.result_category,
                )
            )
            return

        if kind == "on_chat_model_end":
            output: object = event_data.get("output")
            message = _message_mapping(output)
            if message is None:
                return

            self.model_calls.append(_model_call_record(self.sequence, message))
            for proposal_name in _tool_call_names(message):
                self.add_event(
                    TrajectoryEventKind.TOOL_PROPOSAL,
                    name=proposal_name,
                )

            content = _message_text(message)
            if content:
                self.final_response = content
                self.add_event(TrajectoryEventKind.ASSISTANT_OUTPUT)

    def flush_pending_tools(self) -> None:
        for pending in self.pending_tools.values():
            if pending.name == "task":
                continue
            self.completed_tools.append(
                ObservedToolCall(
                    sequence=pending.sequence,
                    name=pending.name,
                    source=pending.source,
                    arguments=pending.arguments,
                    is_error=True,
                    result_category="incomplete",
                )
            )
        self.pending_tools.clear()

    def _source_for(self, name: str) -> ToolSource:
        if name in self._teamspace_tool_names:
            return ToolSource.TEAMSPACE
        return ToolSource.UNKNOWN


class AgentProtocolExecutor:
    """Execute one eval case through only the public Agent Protocol surface."""

    def __init__(
        self,
        client_factory: Callable[[FixtureLease], AgentExecutionClient],
        *,
        assistant_id: str = "teamspace",
        teamspace_tool_names: frozenset[str] | None = None,
        raw_dir: Path | None = None,
    ) -> None:
        self._client_factory = client_factory
        self._assistant_id = assistant_id
        self._teamspace_tool_names = teamspace_tool_names or frozenset()
        self._raw_dir = raw_dir

    @classmethod
    def for_http(
        cls,
        server_url: str,
        *,
        headers_for_lease: Callable[[FixtureLease], Mapping[str, str]],
        assistant_id: str = "teamspace",
        teamspace_tool_names: frozenset[str] | None = None,
        raw_dir: Path | None = None,
    ) -> AgentProtocolExecutor:
        return cls(
            lambda lease: AgentProtocolClient(
                server_url,
                headers=headers_for_lease(lease),
            ),
            assistant_id=assistant_id,
            teamspace_tool_names=teamspace_tool_names,
            raw_dir=raw_dir,
        )

    async def execute(
        self,
        case: EvalCase,
        lease: FixtureLease,
    ) -> ObservedTrajectory:
        started = perf_counter()
        client = self._client_factory(lease)
        thread = await client.create_thread()
        thread_id = _required_string(thread, "thread_id")

        collector = _Collector(
            teamspace_tool_names=self._teamspace_tool_names,
        )
        run_ids: list[str] = []
        run_statuses: list[str] = []
        turns = 0
        interrupt_cursor = 0
        retry_approval_rounds = 0
        stop = False
        client_context = _client_context(case, lease)
        run_config: dict[str, Any] = (
            {"config": {"configurable": {"client_context": client_context}}}
            if client_context
            else {}
        )

        for user_input in case.input:
            if stop:
                break
            turns += 1
            collector.add_event(TrajectoryEventKind.USER_INPUT)
            run = await client.create_run(
                thread_id,
                self._assistant_id,
                input={
                    "messages": [
                        {
                            "role": "user",
                            "content": user_input,
                        }
                    ]
                },
                stream_mode=_STREAM_MODES,
                stream_subgraphs=True,
                **run_config,
            )

            while True:
                run_id = _required_string(run, "run_id")
                run_ids.append(run_id)
                status = await _consume_run(
                    client,
                    thread_id,
                    run_id,
                    collector,
                )
                run_statuses.append(status)

                if status != "interrupted":
                    if status != "success":
                        stop = True
                    break

                state = await client.get_state(thread_id, subgraphs=False)
                actions = _interrupt_actions(state)
                if not actions:
                    stop = True
                    break

                expectations = case.expected_interrupts[
                    interrupt_cursor : interrupt_cursor + len(actions)
                ]
                repeated = (
                    _repeated_approvals(case, actions)
                    if len(expectations) != len(actions)
                    and retry_approval_rounds < _MAX_RETRY_APPROVAL_ROUNDS
                    else None
                )
                if repeated is not None:
                    retry_approval_rounds += 1
                    expectations = repeated
                if len(expectations) != len(actions):
                    for action in actions:
                        collector.add_event(
                            TrajectoryEventKind.INTERRUPT,
                            name=action.name,
                        )
                    stop = True
                    break

                decisions: list[dict[str, object]] = []
                valid_resume = True
                for action, expectation in zip(
                    actions,
                    expectations,
                    strict=True,
                ):
                    collector.add_event(
                        TrajectoryEventKind.TOOL_PROPOSAL,
                        name=action.name,
                    )
                    collector.add_event(
                        TrajectoryEventKind.INTERRUPT,
                        name=action.name,
                    )
                    if (
                        expectation.before_tool is not None
                        and expectation.before_tool != action.name
                    ):
                        valid_resume = False
                        continue

                    decision = _decision_payload(expectation, action)
                    decisions.append(decision)
                    collector.add_event(
                        TrajectoryEventKind.DECISION,
                        name=expectation.decision,
                        attributes={"decision": expectation.decision},
                    )

                if not valid_resume:
                    stop = True
                    break

                if repeated is None:
                    interrupt_cursor += len(actions)
                run = await client.create_run(
                    thread_id,
                    self._assistant_id,
                    command={
                        "resume": {
                            "decisions": decisions,
                        }
                    },
                    stream_mode=_STREAM_MODES,
                    stream_subgraphs=True,
                )

            if stop:
                break

        collector.flush_pending_tools()
        final_response = collector.final_response
        if final_response:
            collector.add_event(TrajectoryEventKind.FINAL_RESPONSE)

        latency_ms = (perf_counter() - started) * 1000
        trajectory = ObservedTrajectory(
            case_id=case.id,
            thread_id=thread_id,
            run_ids=run_ids,
            run_statuses=run_statuses,
            events=collector.events,
            tools_called=sorted(
                collector.completed_tools,
                key=lambda call: call.sequence,
            ),
            final_response=final_response,
            turns=turns,
            subagents=collector.subagents,
            latency_ms=latency_ms,
        )
        if self._raw_dir is not None:
            # 승인 대기로 끝난 run은 stream에 마지막 values가 없어 thread state에서 대화를 읽는다.
            state = await client.get_state(thread_id, subgraphs=False)
            state_values: object = state.get("values")
            write_raw_trace(
                self._raw_dir,
                case,
                lease,
                trajectory,
                client_context=client_context,
                tool_outputs=collector.tool_outputs,
                model_calls=collector.model_calls,
                messages=_message_records(
                    cast(Mapping[str, Any], state_values)
                    if isinstance(state_values, Mapping)
                    else collector.last_values
                ),
            )
        return trajectory


async def _consume_run(
    client: AgentExecutionClient,
    thread_id: str,
    run_id: str,
    collector: _Collector,
) -> str:
    stream_error: Exception | None = None
    try:
        async for part in client.resume_stream(
            thread_id,
            run_id,
            stream_mode=_STREAM_MODES,
        ):
            collector.consume_part(part)
    except Exception as error:
        stream_error = error

    run = await client.get_run(thread_id, run_id)
    status = _required_string(run, "status")
    if stream_error is not None and status not in _TERMINAL_STATUSES:
        raise stream_error
    return status


def _repeated_approvals(
    case: EvalCase,
    actions: list[_InterruptAction],
) -> list[InterruptExpectation] | None:
    """Reuse an approve expectation when the agent proposes the same tool again."""

    repeated: list[InterruptExpectation] = []
    for action in actions:
        match = next(
            (
                expectation
                for expectation in case.expected_interrupts
                if expectation.decision == "approve"
                and expectation.before_tool == action.name
            ),
            None,
        )
        if match is None:
            return None
        repeated.append(match)
    return repeated or None


def _message_records(values: Mapping[str, Any] | None) -> list[dict[str, Any]]:
    raw_messages: object = (values or {}).get("messages")
    if not isinstance(raw_messages, list):
        return []
    records: list[dict[str, Any]] = []
    for raw_message in cast(list[object], raw_messages):
        message = _unwrapped_message(_message_mapping(raw_message))
        if message is None:
            continue
        text = _message_text(message)
        records.append(
            {
                "type": message.get("type") or message.get("role"),
                "name": message.get("name"),
                "status": message.get("status"),
                "tool_calls": _model_call_record(0, message)["tool_calls"],
                "text": text[:RAW_TEXT_LIMIT] if text else None,
            }
        )
    return records


def _decision_payload(
    expectation: InterruptExpectation,
    action: _InterruptAction,
) -> dict[str, object]:
    if expectation.decision != "edit":
        return {"type": expectation.decision}
    return {
        "type": "edit",
        "editedAction": {
            "name": action.name,
            "args": dict(expectation.edited_arguments or {}),
        },
    }


def _interrupt_actions(state: Mapping[str, Any]) -> list[_InterruptAction]:
    raw_tasks: object = state.get("tasks")
    if not isinstance(raw_tasks, list):
        return []

    actions: list[_InterruptAction] = []
    for raw_task in cast(list[object], raw_tasks):
        if not isinstance(raw_task, Mapping):
            continue
        task = cast(Mapping[str, Any], raw_task)
        raw_interrupts: object = task.get("interrupts")
        if not isinstance(raw_interrupts, list):
            continue
        for raw_interrupt in cast(list[object], raw_interrupts):
            if not isinstance(raw_interrupt, Mapping):
                continue
            interrupt = cast(Mapping[str, Any], raw_interrupt)
            value = interrupt.get("value")
            if not isinstance(value, Mapping):
                continue
            hitl = cast(Mapping[str, Any], value)
            raw_requests = hitl.get("actionRequests")
            if raw_requests is None:
                raw_requests = hitl.get("action_requests")
            if not isinstance(raw_requests, list):
                continue
            for raw_request in cast(list[object], raw_requests):
                if not isinstance(raw_request, Mapping):
                    continue
                request = cast(Mapping[str, Any], raw_request)
                name = request.get("name")
                if not isinstance(name, str) or not name:
                    name = request.get("action_name")
                if not isinstance(name, str) or not name:
                    continue
                arguments = request.get("args")
                actions.append(
                    _InterruptAction(
                        name=name,
                        arguments=_mapping_copy(arguments),
                    )
                )
    return actions


def _client_context(case: EvalCase, lease: FixtureLease) -> dict[str, object] | None:
    context = case.client_context
    if context is None:
        return None

    params = {
        key: str(resolve_fixture_reference(value, lease.public_ids))
        for key, value in context.params.items()
    }

    payload: dict[str, object] = {}
    if context.time_zone is not None:
        payload["timeZone"] = context.time_zone
    if context.route is not None:
        payload["route"] = context.route
    if params:
        payload["params"] = params
    return payload or None


def _unwrapped_message(value: object) -> Mapping[str, Any] | None:
    if not isinstance(value, Mapping):
        return None
    mapping = cast(Mapping[str, Any], value)
    kwargs = mapping.get("kwargs")
    if isinstance(kwargs, Mapping):
        return cast(Mapping[str, Any], kwargs)
    return mapping


def _tool_reported_error(output: object) -> bool:
    message = _unwrapped_message(output)
    return message is not None and message.get("status") == "error"


def _tool_output_text(output: object) -> str | None:
    if output is None:
        return None
    if isinstance(output, str):
        return output[:RAW_TEXT_LIMIT] or None
    message = _unwrapped_message(output)
    if message is None:
        return str(output)[:RAW_TEXT_LIMIT]
    text = _message_text(message)
    if text:
        return text[:RAW_TEXT_LIMIT]
    return str(dict(message))[:RAW_TEXT_LIMIT]


def _model_call_record(sequence: int, message: Mapping[str, Any]) -> dict[str, Any]:
    source = _unwrapped_message(message) or message
    usage: object = source.get("usage_metadata")
    usage_mapping: Mapping[str, object] = (
        cast(Mapping[str, object], usage)
        if isinstance(usage, Mapping)
        else cast(Mapping[str, object], {})
    )
    raw_calls: object = source.get("tool_calls")
    tool_calls: list[dict[str, object]] = []
    if isinstance(raw_calls, list):
        for raw_call in cast(list[object], raw_calls):
            if not isinstance(raw_call, Mapping):
                continue
            call = cast(Mapping[str, object], raw_call)
            tool_calls.append({"name": call.get("name"), "args": call.get("args")})
    text = _message_text(source)
    return {
        "sequence": sequence,
        "input_tokens": usage_mapping.get("input_tokens"),
        "output_tokens": usage_mapping.get("output_tokens"),
        "tool_calls": tool_calls,
        "text": text[:RAW_TEXT_LIMIT] if text else None,
    }


def _part_field(part: object, field: str) -> object:
    if isinstance(part, Mapping):
        return cast(Mapping[str, object], part).get(field)
    return getattr(part, field, None)


def _required_string(value: Mapping[str, Any], field: str) -> str:
    raw = value.get(field)
    if not isinstance(raw, str) or not raw:
        raise RuntimeError(f"Agent Protocol response is missing {field!r}")
    return raw


def _mapping_copy(value: object) -> dict[str, Any]:
    if not isinstance(value, Mapping):
        return {}
    mapping = cast(Mapping[object, object], value)
    return {
        key: item
        for key, item in mapping.items()
        if isinstance(key, str)
    }


def _scalar_string(value: object) -> str | None:
    return value if isinstance(value, str) and value else None


def _message_mapping(value: object) -> Mapping[str, Any] | None:
    if isinstance(value, Mapping):
        mapping = cast(Mapping[str, Any], value)
        nested = mapping.get("message")
        if isinstance(nested, Mapping):
            return cast(Mapping[str, Any], nested)
        return mapping
    return None


def _tool_call_names(message: Mapping[str, Any]) -> list[str]:
    raw_calls: object = message.get("tool_calls")
    if raw_calls is None:
        raw_calls = message.get("toolCalls")
    if not isinstance(raw_calls, list):
        return []

    names: list[str] = []
    for raw_call in cast(list[object], raw_calls):
        if not isinstance(raw_call, Mapping):
            continue
        name = cast(Mapping[str, object], raw_call).get("name")
        if isinstance(name, str) and name:
            names.append(name)
    return names


def _message_text(message: Mapping[str, Any]) -> str | None:
    content: object = message.get("content")
    if isinstance(content, str):
        return content[:64_000] if content else None
    if not isinstance(content, list):
        return None

    parts: list[str] = []
    for block in cast(list[object], content):
        if not isinstance(block, Mapping):
            continue
        text = cast(Mapping[str, object], block).get("text")
        if isinstance(text, str) and text:
            parts.append(text)
    combined = "".join(parts)
    return combined[:64_000] if combined else None


def _last_assistant_text(values: Mapping[str, Any]) -> str | None:
    raw_messages: object = values.get("messages")
    if not isinstance(raw_messages, list):
        return None

    for raw_message in reversed(cast(list[object], raw_messages)):
        message = _message_mapping(raw_message)
        if message is None:
            continue
        role = message.get("role")
        message_type = message.get("type")
        if role not in {"assistant", "ai"} and message_type not in {"assistant", "ai"}:
            continue
        text = _message_text(message)
        if text:
            return text
    return None
