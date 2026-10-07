from __future__ import annotations

from collections.abc import AsyncIterator, Callable, Mapping
from dataclasses import dataclass
from time import perf_counter
from typing import Any, Protocol, cast

from langgraph_sdk.schema import StreamMode

from clients.agent_protocol import AgentProtocolClient
from datasets.schema import EvalCase, InterruptExpectation
from fixtures.lifecycle import FixtureLease
from runner.trajectory import (
    ObservedToolCall,
    ObservedTrajectory,
    ToolSource,
    TrajectoryEvent,
    TrajectoryEventKind,
)

_STREAM_MODES: list[StreamMode] = ["events", "values"]
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
        work_os_tool_names: frozenset[str],
    ) -> None:
        self._work_os_tool_names = work_os_tool_names
        self.sequence = 0
        self.events: list[TrajectoryEvent] = []
        self.completed_tools: list[ObservedToolCall] = []
        self.pending_tools: dict[str, _PendingTool] = {}
        self.subagents = 0
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

            if pending is None:
                sequence = self.add_event(
                    TrajectoryEventKind.TOOL_ERROR
                    if kind == "on_tool_error"
                    else TrajectoryEventKind.TOOL_RESULT,
                    name=tool_name,
                )
                self.completed_tools.append(
                    ObservedToolCall(
                        sequence=sequence,
                        name=tool_name,
                        source=self._source_for(tool_name),
                        arguments={},
                        is_error=kind == "on_tool_error",
                        result_category="error"
                        if kind == "on_tool_error"
                        else "success",
                    )
                )
                return

            pending.is_error = kind == "on_tool_error"
            pending.result_category = "error" if pending.is_error else "success"
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
        if name in self._work_os_tool_names:
            return ToolSource.WORK_OS
        return ToolSource.UNKNOWN


class AgentProtocolExecutor:
    """Execute one eval case through only the public Agent Protocol surface."""

    def __init__(
        self,
        client_factory: Callable[[FixtureLease], AgentExecutionClient],
        *,
        assistant_id: str = "workos",
        work_os_tool_names: frozenset[str] | None = None,
    ) -> None:
        self._client_factory = client_factory
        self._assistant_id = assistant_id
        self._work_os_tool_names = work_os_tool_names or frozenset()

    @classmethod
    def for_http(
        cls,
        server_url: str,
        *,
        headers_for_lease: Callable[[FixtureLease], Mapping[str, str]],
        assistant_id: str = "workos",
        work_os_tool_names: frozenset[str] | None = None,
    ) -> AgentProtocolExecutor:
        return cls(
            lambda lease: AgentProtocolClient(
                server_url,
                headers=headers_for_lease(lease),
            ),
            assistant_id=assistant_id,
            work_os_tool_names=work_os_tool_names,
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
            work_os_tool_names=self._work_os_tool_names,
        )
        run_ids: list[str] = []
        run_statuses: list[str] = []
        turns = 0
        interrupt_cursor = 0
        stop = False

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
        return ObservedTrajectory(
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
