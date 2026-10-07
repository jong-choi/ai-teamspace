from __future__ import annotations

import hashlib
from typing import Any, cast

import httpx
from langgraph_sdk.errors import AuthenticationError, PermissionDeniedError

from datasets.schema import (
    ArgumentOperator,
    EvalCase,
    ExecutionExpectation,
    ToolExpectationMode,
)
from fixtures.deterministic import DeterministicFixtureProvider
from fixtures.lifecycle import FixtureLease
from runner.trajectory import (
    ObservedToolCall,
    ObservedTrajectory,
    ToolSource,
    TrajectoryEvent,
    TrajectoryEventKind,
)


def _stable_id(prefix: str, *parts: str) -> str:
    digest = hashlib.sha256("\x00".join(parts).encode()).hexdigest()[:20]
    return f"{prefix}-{digest}"


def _set_path(target: dict[str, Any], path: str, value: Any) -> None:
    segments = path.split(".")
    current: dict[str, Any] | list[Any] = target

    for index, segment in enumerate(segments):
        last = index == len(segments) - 1
        next_is_index = not last and segments[index + 1].isdigit()

        if isinstance(current, dict):
            if last:
                current[segment] = value
                return
            child = current.get(segment)
            if next_is_index:
                if not isinstance(child, list):
                    child = []
                    current[segment] = child
            else:
                if not isinstance(child, dict):
                    child = {}
                    current[segment] = child
            current = cast(dict[str, Any] | list[Any], child)
            continue

        try:
            position = int(segment)
        except ValueError as error:
            raise ValueError(f"list argument path segment must be numeric: {segment}") from error
        while len(current) <= position:
            current.append(None)
        if last:
            current[position] = value
            return
        child = current[position]
        if next_is_index:
            if not isinstance(child, list):
                child = []
                current[position] = child
        else:
            if not isinstance(child, dict):
                child = {}
                current[position] = child
        current = cast(dict[str, Any] | list[Any], child)


def _argument_value(operator: ArgumentOperator, value: object) -> object:
    if operator == ArgumentOperator.PRESENT:
        return "fixture-present"
    if operator in {
        ArgumentOperator.EXACT,
        ArgumentOperator.CONTAINS,
    }:
        return value
    if operator == ArgumentOperator.ONE_OF:
        if not isinstance(value, list) or not value:
            raise ValueError("deterministic one_of assertion requires a non-empty list")
        allowed = cast(list[object], value)
        return allowed[0]
    raise ValueError(f"operator has no materialized value: {operator}")


def _arguments_for(case: EvalCase, tool: str) -> dict[str, Any]:
    arguments: dict[str, Any] = {}
    for assertion in case.argument_assertions:
        if assertion.tool != tool or assertion.operator == ArgumentOperator.ABSENT:
            continue
        _set_path(
            arguments,
            assertion.path,
            _argument_value(assertion.operator, assertion.value),
        )
    return arguments


def _auth_error(case: EvalCase) -> AuthenticationError | PermissionDeniedError:
    status = 401 if case.persona == "expired-invalid-credential" else 403
    request = httpx.Request("POST", "http://fixture.invalid/runs")
    response = httpx.Response(status, request=request)
    if status == 401:
        return AuthenticationError(
            "deterministic fixture rejected the Agent session",
            response=response,
            body={"detail": "fixture authentication denied"},
        )
    return PermissionDeniedError(
        "deterministic fixture rejected Agent authorization",
        response=response,
        body={"detail": "fixture authorization denied"},
    )


class DeterministicAgentExecutor:
    """Dataset expectation을 deterministic trajectory로 재현하는 PR fast executor."""

    def __init__(self, fixtures: DeterministicFixtureProvider) -> None:
        self._fixtures = fixtures

    async def execute(
        self,
        case: EvalCase,
        lease: FixtureLease,
    ) -> ObservedTrajectory:
        if case.expected_execution == ExecutionExpectation.AUTH_DENIED:
            raise _auth_error(case)

        sequence = 0
        events: list[TrajectoryEvent] = []
        calls: list[ObservedToolCall] = []

        def add_event(
            kind: TrajectoryEventKind,
            *,
            name: str | None = None,
            attributes: dict[str, str | int | float | bool | None] | None = None,
        ) -> int:
            nonlocal sequence
            sequence += 1
            events.append(
                TrajectoryEvent(
                    sequence=sequence,
                    kind=kind,
                    name=name,
                    attributes=attributes or {},
                )
            )
            return sequence

        for _ in case.input:
            add_event(TrajectoryEventKind.USER_INPUT)

        rejected: set[str] = set()
        forced_arguments: dict[str, dict[str, Any]] = {}
        interrupt_tools: list[str] = []
        for expectation in case.expected_interrupts:
            tool = expectation.before_tool
            if tool is not None:
                interrupt_tools.append(tool)
                add_event(TrajectoryEventKind.TOOL_PROPOSAL, name=tool)
            add_event(TrajectoryEventKind.INTERRUPT, name=tool)
            add_event(
                TrajectoryEventKind.DECISION,
                name=expectation.decision,
                attributes={"decision": expectation.decision},
            )
            if tool is None:
                continue
            if expectation.decision == "reject":
                rejected.add(tool)
            elif expectation.decision == "edit":
                forced_arguments[tool] = dict(expectation.edited_arguments or {})

        desired_tools: list[str] = []
        if case.expected_tools is not None:
            if case.expected_tools.mode == ToolExpectationMode.ANY_OF:
                desired_tools.append(case.expected_tools.tools[0])
            else:
                desired_tools.extend(case.expected_tools.tools)
        desired_tools.extend(
            assertion.tool
            for assertion in case.argument_assertions
            if assertion.tool not in desired_tools
        )
        desired_tools.extend(
            tool for tool in interrupt_tools if tool not in desired_tools
        )

        seen: set[str] = set()
        for tool in desired_tools:
            if tool in seen or tool in rejected:
                continue
            seen.add(tool)
            call_sequence = add_event(TrajectoryEventKind.TOOL_CALL, name=tool)
            arguments = forced_arguments.get(tool)
            if arguments is None:
                arguments = _arguments_for(case, tool)
            calls.append(
                ObservedToolCall(
                    sequence=call_sequence,
                    name=tool,
                    source=ToolSource.WORK_OS,
                    arguments=arguments,
                    is_error=False,
                    result_category="success",
                )
            )
            add_event(TrajectoryEventKind.TOOL_RESULT, name=tool)

        self._fixtures.materialize_expected_outcomes(case, lease)

        final_response = "deterministic fixture response"
        add_event(TrajectoryEventKind.ASSISTANT_OUTPUT)
        add_event(TrajectoryEventKind.FINAL_RESPONSE)

        run_id = _stable_id("fixture-run", lease.owner, case.id)
        return ObservedTrajectory(
            case_id=case.id,
            thread_id=_stable_id("fixture-thread", lease.owner),
            run_ids=[run_id],
            run_statuses=["success"],
            events=events,
            tools_called=calls,
            final_response=final_response,
            turns=len(case.input),
            subagents=0,
            latency_ms=1,
            estimated_cost=0,
        )
