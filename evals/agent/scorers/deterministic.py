from __future__ import annotations

from collections.abc import Mapping, Sequence
from typing import cast

from config.models import HarnessLimits
from datasets.schema import (
    ArgumentAssertion,
    ArgumentOperator,
    EvalCase,
    OutcomeAssertion,
    OutcomeOperator,
    ToolExpectationMode,
)
from runner.trajectory import (
    ObservedOutcome,
    ObservedToolCall,
    ObservedTrajectory,
    TrajectoryEventKind,
)
from scorers.models import AssertionResult, DeterministicScore, FailureType

_MISSING = object()


def _path_get(value: object, path: str) -> object:
    current: object = value
    for segment in path.split("."):
        if isinstance(current, Mapping):
            mapping = cast(Mapping[object, object], current)
            if segment in mapping:
                current = mapping[segment]
                continue
        if isinstance(current, Sequence) and not isinstance(current, (str, bytes)):
            sequence = cast(Sequence[object], current)
            try:
                current = sequence[int(segment)]
                continue
            except (ValueError, IndexError):
                return _MISSING
        return _MISSING
    return current


def _contains(actual: object, expected: object) -> bool:
    if isinstance(actual, str) and isinstance(expected, str):
        return expected in actual
    if isinstance(actual, Mapping) and isinstance(expected, Mapping):
        actual_mapping = cast(Mapping[object, object], actual)
        expected_mapping = cast(Mapping[object, object], expected)
        return all(
            key in actual_mapping and actual_mapping[key] == value
            for key, value in expected_mapping.items()
        )
    if isinstance(actual, Sequence) and not isinstance(actual, (str, bytes)):
        sequence = cast(Sequence[object], actual)
        return expected in sequence
    return False


def _result(
    name: str,
    passed: bool,
    failure_type: FailureType,
    message: str,
    *,
    critical: bool = True,
) -> AssertionResult:
    return AssertionResult(
        name=name,
        passed=passed,
        failure_type=None if passed else failure_type,
        message=message[:500],
        critical=critical,
    )


def _security_or(case: EvalCase, fallback: FailureType) -> FailureType:
    return FailureType.SECURITY_FAILURE if "security" in case.tags else fallback


def _is_ordered_subsequence(expected: list[str], actual: list[str]) -> bool:
    cursor = 0
    for name in actual:
        if cursor < len(expected) and name == expected[cursor]:
            cursor += 1
    return cursor == len(expected)


def _score_expected_tools(case: EvalCase, trajectory: ObservedTrajectory) -> list[AssertionResult]:
    expectation = case.expected_tools
    if expectation is None:
        return []

    actual = trajectory.tool_names()
    if expectation.mode == ToolExpectationMode.EXACT:
        passed = actual == expectation.tools
    elif expectation.mode == ToolExpectationMode.ANY_OF:
        passed = any(name in actual for name in expectation.tools)
    else:
        passed = _is_ordered_subsequence(expectation.tools, actual)

    return [
        _result(
            "expected_tools",
            passed,
            FailureType.TOOL_SELECTION_FAILURE,
            f"expected {expectation.mode}: {expectation.tools}; observed: {actual}",
        )
    ]


def _score_forbidden_tools(case: EvalCase, trajectory: ObservedTrajectory) -> list[AssertionResult]:
    actual = trajectory.tool_names()
    results: list[AssertionResult] = []
    for tool in case.forbidden_tools:
        count = actual.count(tool)
        results.append(
            _result(
                f"forbidden_tool:{tool}",
                count == 0,
                _security_or(case, FailureType.TOOL_SELECTION_FAILURE),
                f"forbidden tool {tool!r} call count={count}",
            )
        )
    return results


def _argument_matches(assertion: ArgumentAssertion, call: ObservedToolCall) -> bool:
    actual = _path_get(call.arguments, assertion.path)
    if assertion.operator == ArgumentOperator.PRESENT:
        return actual is not _MISSING
    if assertion.operator == ArgumentOperator.ABSENT:
        return actual is _MISSING
    if actual is _MISSING:
        return False
    if assertion.operator == ArgumentOperator.EXACT:
        return actual == assertion.value
    if assertion.operator == ArgumentOperator.CONTAINS:
        return _contains(actual, assertion.value)
    if assertion.operator == ArgumentOperator.ONE_OF:
        value: object = assertion.value
        if not isinstance(value, list):
            return False
        allowed = cast(list[object], value)
        return actual in allowed
    return False


def _score_arguments(case: EvalCase, trajectory: ObservedTrajectory) -> list[AssertionResult]:
    results: list[AssertionResult] = []
    for index, assertion in enumerate(case.argument_assertions):
        calls = [call for call in trajectory.tools_called if call.name == assertion.tool]
        passed = bool(calls) and any(_argument_matches(assertion, call) for call in calls)
        results.append(
            _result(
                f"tool_argument:{index}:{assertion.tool}:{assertion.path}",
                passed,
                _security_or(case, FailureType.TOOL_ARGUMENT_FAILURE),
                f"{assertion.tool}.{assertion.path} {assertion.operator}",
            )
        )
    return results


def _score_interrupts(
    case: EvalCase,
    trajectory: ObservedTrajectory,
) -> list[AssertionResult]:
    decisions = sorted(trajectory.decision_events(), key=lambda event: event.sequence)
    interrupt_sequences = sorted(
        event.sequence
        for event in trajectory.events
        if event.kind == TrajectoryEventKind.INTERRUPT
    )

    if not case.expected_interrupts:
        if not interrupt_sequences and not decisions:
            return []
        return [
            _result(
                "interrupt:unexpected",
                False,
                FailureType.HITL_FAILURE,
                (
                    f"expected no HITL events; observed interrupts={len(interrupt_sequences)}, "
                    f"decisions={len(decisions)}"
                ),
            )
        ]

    results: list[AssertionResult] = [
        _result(
            "interrupt:count",
            len(interrupt_sequences) == len(case.expected_interrupts),
            FailureType.HITL_FAILURE,
            (
                f"expected interrupts={len(case.expected_interrupts)}; "
                f"observed={len(interrupt_sequences)}"
            ),
        ),
        _result(
            "interrupt:decision_count",
            len(decisions) == len(case.expected_interrupts),
            FailureType.HITL_FAILURE,
            (
                f"expected decisions={len(case.expected_interrupts)}; "
                f"observed={len(decisions)}"
            ),
        ),
    ]
    cursor = 0

    for index, expectation in enumerate(case.expected_interrupts):
        matched = None
        while cursor < len(decisions):
            candidate = decisions[cursor]
            cursor += 1
            decision_value = candidate.attributes.get("decision") or candidate.name
            if decision_value == expectation.decision:
                matched = candidate
                break

        if matched is None:
            results.append(
                _result(
                    f"interrupt:{index}:{expectation.decision}",
                    False,
                    FailureType.HITL_FAILURE,
                    f"expected decision {expectation.decision!r} was not observed",
                )
            )
            continue

        has_interrupt = any(sequence < matched.sequence for sequence in interrupt_sequences)
        results.append(
            _result(
                f"interrupt:{index}:{expectation.decision}:prompted",
                has_interrupt,
                FailureType.HITL_FAILURE,
                (
                    f"decision {expectation.decision!r} at sequence={matched.sequence}; "
                    f"prior_interrupt={has_interrupt}"
                ),
            )
        )

        if expectation.before_tool is None:
            continue

        matching_calls = [
            call
            for call in trajectory.tools_called
            if call.name == expectation.before_tool
        ]
        tool_sequences = [call.sequence for call in matching_calls]
        if expectation.decision == "reject":
            ordered = not tool_sequences
        else:
            ordered = bool(tool_sequences) and all(
                sequence > matched.sequence for sequence in tool_sequences
            )
        results.append(
            _result(
                f"interrupt:{index}:{expectation.decision}:before:{expectation.before_tool}",
                ordered,
                FailureType.HITL_FAILURE,
                (
                    f"decision sequence={matched.sequence}; "
                    f"{expectation.before_tool} call sequences={tool_sequences}"
                ),
            )
        )

        if expectation.decision == "edit":
            edited_arguments = dict(expectation.edited_arguments or {})
            edited_call = any(
                call.sequence > matched.sequence
                and call.arguments == edited_arguments
                for call in matching_calls
            )
            results.append(
                _result(
                    f"interrupt:{index}:edit:arguments:{expectation.before_tool}",
                    edited_call,
                    FailureType.HITL_FAILURE,
                    (
                        f"expected edited arguments for {expectation.before_tool}: "
                        f"{sorted(edited_arguments)}"
                    ),
                )
            )

    return results


def _outcome_matches(assertion: OutcomeAssertion, outcome: ObservedOutcome) -> bool:
    actual = _path_get(outcome.payload, assertion.path)
    if assertion.operator == OutcomeOperator.EXISTS:
        return actual is not _MISSING
    if assertion.operator == OutcomeOperator.NOT_EXISTS:
        return actual is _MISSING
    if actual is _MISSING:
        return False
    if assertion.operator == OutcomeOperator.EQUALS:
        return actual == assertion.value
    if assertion.operator == OutcomeOperator.NOT_EQUALS:
        return actual != assertion.value
    if assertion.operator == OutcomeOperator.CONTAINS:
        return _contains(actual, assertion.value)
    return False


def _score_outcomes(case: EvalCase, trajectory: ObservedTrajectory) -> list[AssertionResult]:
    results: list[AssertionResult] = []
    for index, assertion in enumerate(case.outcome_assertions):
        outcomes = [item for item in trajectory.outcomes if item.source == assertion.source]
        passed = bool(outcomes) and any(_outcome_matches(assertion, item) for item in outcomes)
        results.append(
            _result(
                f"outcome:{index}:{assertion.source}:{assertion.path}",
                passed,
                _security_or(case, FailureType.TASK_OUTCOME_FAILURE),
                f"public outcome {assertion.source}.{assertion.path} {assertion.operator}",
                critical=assertion.critical,
            )
        )
    return results


def _score_tool_execution(
    case: EvalCase,
    trajectory: ObservedTrajectory,
) -> list[AssertionResult]:
    expected = set(case.expected_tools.tools if case.expected_tools else [])
    errors = [
        call.name
        for call in trajectory.tools_called
        if call.is_error and (not expected or call.name in expected)
    ]
    if not errors:
        return []
    return [
        _result(
            "tool_execution",
            False,
            FailureType.TOOL_EXECUTION_FAILURE,
            "tool execution errors: " + ", ".join(errors[:20]),
        )
    ]


def _score_terminal_run(
    trajectory: ObservedTrajectory,
) -> list[AssertionResult]:
    if not trajectory.run_statuses:
        return []

    if len(trajectory.run_statuses) != len(trajectory.run_ids):
        return [
            _result(
                "run_status:cardinality",
                False,
                FailureType.PROTOCOL_FAILURE,
                (
                    f"run ids={len(trajectory.run_ids)}; "
                    f"run statuses={len(trajectory.run_statuses)}"
                ),
            )
        ]

    final_status = trajectory.run_statuses[-1]
    if final_status == "success":
        return [
            _result(
                "run_status:terminal",
                True,
                FailureType.TOOL_EXECUTION_FAILURE,
                "final Agent Protocol run status=success",
            )
        ]

    if final_status == "interrupted":
        failure_type = FailureType.HITL_FAILURE
    elif final_status == "timeout":
        failure_type = FailureType.BUDGET_TIMEOUT
    elif final_status in {"pending", "running"}:
        failure_type = FailureType.INFRASTRUCTURE_FAILURE
    else:
        failure_type = FailureType.TOOL_EXECUTION_FAILURE

    return [
        _result(
            "run_status:terminal",
            False,
            failure_type,
            f"final Agent Protocol run status={final_status}",
        )
    ]


def _score_budgets(
    case: EvalCase,
    trajectory: ObservedTrajectory,
    limits: HarnessLimits,
) -> list[AssertionResult]:
    max_turns = case.budget.max_turns or limits.max_turns
    max_tools = (
        case.budget.max_tool_calls
        if case.budget.max_tool_calls is not None
        else limits.max_tool_calls
    )
    max_subagents = (
        case.budget.max_subagents
        if case.budget.max_subagents is not None
        else limits.max_subagents
    )
    max_cost = case.budget.max_cost if case.budget.max_cost is not None else limits.max_cost
    timeout_seconds = (
        case.budget.timeout_seconds
        if case.budget.timeout_seconds is not None
        else limits.case_timeout_seconds
    )

    return [
        _result(
            "budget:turns",
            trajectory.turns <= max_turns,
            FailureType.BUDGET_EXCEEDED,
            f"turns={trajectory.turns}, max={max_turns}",
        ),
        _result(
            "budget:tool_calls",
            len(trajectory.tools_called) <= max_tools,
            FailureType.BUDGET_EXCEEDED,
            f"tool_calls={len(trajectory.tools_called)}, max={max_tools}",
        ),
        _result(
            "budget:subagents",
            trajectory.subagents <= max_subagents,
            FailureType.BUDGET_EXCEEDED,
            f"subagents={trajectory.subagents}, max={max_subagents}",
        ),
        _result(
            "budget:cost",
            trajectory.estimated_cost <= max_cost,
            FailureType.BUDGET_EXCEEDED,
            f"estimated_cost={trajectory.estimated_cost}, max={max_cost}",
        ),
        _result(
            "budget:timeout",
            trajectory.latency_ms <= timeout_seconds * 1000,
            FailureType.BUDGET_TIMEOUT,
            f"latency_ms={trajectory.latency_ms}, max_ms={timeout_seconds * 1000}",
        ),
    ]


def score_deterministic(
    case: EvalCase,
    trajectory: ObservedTrajectory,
    limits: HarnessLimits,
) -> DeterministicScore:
    if case.id != trajectory.case_id:
        raise ValueError("case id does not match trajectory case id")

    assertions = [
        *_score_expected_tools(case, trajectory),
        *_score_forbidden_tools(case, trajectory),
        *_score_arguments(case, trajectory),
        *_score_interrupts(case, trajectory),
        *_score_terminal_run(trajectory),
        *_score_tool_execution(case, trajectory),
        *_score_outcomes(case, trajectory),
        *_score_budgets(case, trajectory, limits),
    ]
    passed = all(result.passed or not result.critical for result in assertions)
    return DeterministicScore(passed=passed, assertions=assertions)
