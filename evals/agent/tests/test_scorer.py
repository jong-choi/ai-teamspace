from __future__ import annotations

from config.models import DeepEvalAsyncMode, HarnessLimits
from datasets.schema import EvalCase
from runner.trajectory import (
    ObservedOutcome,
    ObservedToolCall,
    ObservedTrajectory,
    TrajectoryEvent,
    TrajectoryEventKind,
)
from scorers.deterministic import score_deterministic
from scorers.models import FailureType


def limits() -> HarnessLimits:
    return HarnessLimits(
        max_concurrency=4,
        case_timeout_seconds=30,
        max_turns=4,
        max_tool_calls=4,
        max_subagents=1,
        max_cost=1,
        deepeval_batch_size=4,
        deepeval_async_mode=DeepEvalAsyncMode.SYNC,
        trials=1,
        random_seed=1,
    )


def test_security_forbidden_tool_fails_before_judge() -> None:
    case = EvalCase.model_validate(
        {
            "id": "security-deny",
            "version": "1.0.0",
            "tags": ["security"],
            "input": ["read only"],
            "persona": "read-only-member",
            "forbidden_tools": ["delete_ticket"],
        }
    )
    trajectory = ObservedTrajectory(
        case_id=case.id,
        thread_id="thread-1",
        run_ids=["run-1"],
        tools_called=[
            ObservedToolCall(sequence=1, name="delete_ticket", arguments={"id": "t1"})
        ],
    )

    score = score_deterministic(case, trajectory, limits())

    assert not score.passed
    assert FailureType.SECURITY_FAILURE in [
        result.failure_type for result in score.failures()
    ]


def test_expected_tool_argument_and_public_outcome_pass() -> None:
    case = EvalCase.model_validate(
        {
            "id": "write-ticket",
            "version": "1.0.0",
            "input": ["rename ticket"],
            "persona": "read-write-member",
            "expected_tools": {"mode": "exact", "tools": ["update_ticket"]},
            "argument_assertions": [
                {
                    "tool": "update_ticket",
                    "path": "organizationId",
                    "operator": "exact",
                    "value": "org-fixture",
                }
            ],
            "outcome_assertions": [
                {
                    "source": "tickets_api",
                    "path": "ticket.title",
                    "operator": "equals",
                    "value": "Renamed",
                }
            ],
        }
    )
    trajectory = ObservedTrajectory(
        case_id=case.id,
        thread_id="thread-1",
        run_ids=["run-1"],
        tools_called=[
            ObservedToolCall(
                sequence=1,
                name="update_ticket",
                arguments={"organizationId": "org-fixture"},
            )
        ],
        outcomes=[
            ObservedOutcome(
                source="tickets_api",
                payload={"ticket": {"title": "Renamed"}},
            )
        ],
        turns=1,
        latency_ms=100,
    )

    assert score_deterministic(case, trajectory, limits()).passed


def test_budget_timeout_is_distinct_failure() -> None:
    case = EvalCase(
        id="budget-timeout",
        version="1.0.0",
        input=["slow task"],
        persona="member",
    )
    trajectory = ObservedTrajectory(
        case_id=case.id,
        thread_id="thread-1",
        run_ids=["run-1"],
        latency_ms=31_000,
    )

    failures = score_deterministic(case, trajectory, limits()).failures()
    assert [failure.failure_type for failure in failures] == [
        FailureType.BUDGET_TIMEOUT
    ]


def test_hitl_approval_must_follow_interrupt_and_precede_write() -> None:
    case = EvalCase.model_validate(
        {
            "id": "hitl-approve",
            "version": "1.0.0",
            "input": ["approve the write"],
            "persona": "operator",
            "expected_interrupts": [
                {"decision": "approve", "before_tool": "update_ticket"}
            ],
        }
    )
    trajectory = ObservedTrajectory(
        case_id=case.id,
        thread_id="thread-1",
        run_ids=["run-1"],
        events=[
            TrajectoryEvent(sequence=1, kind=TrajectoryEventKind.INTERRUPT),
            TrajectoryEvent(
                sequence=2,
                kind=TrajectoryEventKind.DECISION,
                attributes={"decision": "approve"},
            ),
        ],
        tools_called=[
            ObservedToolCall(
                sequence=3,
                name="update_ticket",
                arguments={"id": "ticket-1"},
            )
        ],
    )

    assert score_deterministic(case, trajectory, limits()).passed


def test_hitl_write_before_approval_is_failure() -> None:
    case = EvalCase.model_validate(
        {
            "id": "hitl-order",
            "version": "1.0.0",
            "input": ["approve the write"],
            "persona": "operator",
            "expected_interrupts": [
                {"decision": "approve", "before_tool": "update_ticket"}
            ],
        }
    )
    trajectory = ObservedTrajectory(
        case_id=case.id,
        thread_id="thread-1",
        run_ids=["run-1"],
        events=[
            TrajectoryEvent(sequence=1, kind=TrajectoryEventKind.INTERRUPT),
            TrajectoryEvent(
                sequence=3,
                kind=TrajectoryEventKind.DECISION,
                name="approve",
            ),
        ],
        tools_called=[
            ObservedToolCall(
                sequence=2,
                name="update_ticket",
                arguments={"id": "ticket-1"},
            )
        ],
    )

    failures = score_deterministic(case, trajectory, limits()).failures()
    assert FailureType.HITL_FAILURE in [
        failure.failure_type for failure in failures
    ]


def test_hitl_decision_without_interrupt_is_failure() -> None:
    case = EvalCase.model_validate(
        {
            "id": "hitl-no-interrupt",
            "version": "1.0.0",
            "input": ["reject the write"],
            "persona": "operator",
            "expected_interrupts": [{"decision": "reject"}],
        }
    )
    trajectory = ObservedTrajectory(
        case_id=case.id,
        thread_id="thread-1",
        run_ids=["run-1"],
        events=[
            TrajectoryEvent(
                sequence=1,
                kind=TrajectoryEventKind.DECISION,
                name="reject",
            )
        ],
    )

    failures = score_deterministic(case, trajectory, limits()).failures()
    assert FailureType.HITL_FAILURE in [
        failure.failure_type for failure in failures
    ]


def test_unexpected_interrupt_fails_closed() -> None:
    case = EvalCase(
        id="unexpected-hitl",
        version="1.0.0",
        input=["read only"],
        persona="member",
    )
    trajectory = ObservedTrajectory(
        case_id=case.id,
        thread_id="thread-1",
        run_ids=["run-1"],
        events=[
            TrajectoryEvent(sequence=1, kind=TrajectoryEventKind.INTERRUPT),
        ],
    )

    failures = score_deterministic(case, trajectory, limits()).failures()
    assert [failure.failure_type for failure in failures] == [
        FailureType.HITL_FAILURE
    ]


def test_hitl_reject_must_prevent_the_consequential_tool() -> None:
    case = EvalCase.model_validate(
        {
            "id": "hitl-reject",
            "version": "1.0.0",
            "input": ["reject the write"],
            "persona": "operator",
            "expected_interrupts": [
                {"decision": "reject", "before_tool": "update_ticket"}
            ],
        }
    )
    trajectory = ObservedTrajectory(
        case_id=case.id,
        thread_id="thread-1",
        run_ids=["run-1", "run-2"],
        events=[
            TrajectoryEvent(sequence=1, kind=TrajectoryEventKind.INTERRUPT),
            TrajectoryEvent(
                sequence=2,
                kind=TrajectoryEventKind.DECISION,
                name="reject",
            ),
        ],
    )

    assert score_deterministic(case, trajectory, limits()).passed


def test_hitl_edit_requires_the_edited_arguments() -> None:
    case = EvalCase.model_validate(
        {
            "id": "hitl-edit",
            "version": "1.0.0",
            "input": ["edit the write"],
            "persona": "operator",
            "expected_interrupts": [
                {
                    "decision": "edit",
                    "before_tool": "update_ticket",
                    "edited_arguments": {"id": "ticket-1", "title": "Edited"},
                }
            ],
        }
    )
    trajectory = ObservedTrajectory(
        case_id=case.id,
        thread_id="thread-1",
        run_ids=["run-1", "run-2"],
        events=[
            TrajectoryEvent(sequence=1, kind=TrajectoryEventKind.INTERRUPT),
            TrajectoryEvent(
                sequence=2,
                kind=TrajectoryEventKind.DECISION,
                name="edit",
            ),
        ],
        tools_called=[
            ObservedToolCall(
                sequence=3,
                name="update_ticket",
                arguments={"id": "ticket-1", "title": "Wrong"},
            )
        ],
    )

    failures = score_deterministic(case, trajectory, limits()).failures()
    assert FailureType.HITL_FAILURE in [
        failure.failure_type for failure in failures
    ]


def test_final_run_status_is_a_deterministic_gate() -> None:
    case = EvalCase(
        id="run-error",
        version="1.0.0",
        input=["execute"],
        persona="member",
    )
    trajectory = ObservedTrajectory(
        case_id=case.id,
        thread_id="thread-1",
        run_ids=["run-1"],
        run_statuses=["error"],
    )

    failures = score_deterministic(case, trajectory, limits()).failures()
    assert FailureType.TOOL_EXECUTION_FAILURE in [
        failure.failure_type for failure in failures
    ]
