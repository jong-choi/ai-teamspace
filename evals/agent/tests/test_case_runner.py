from __future__ import annotations

from dataclasses import dataclass, field

import httpx
from langgraph_sdk.errors import AuthenticationError

from config.models import DeepEvalAsyncMode, HarnessLimits
from datasets.schema import EvalCase
from fixtures.lifecycle import FixtureLease
from reports.schema import MetricResult
from runner.case_runner import run_trial
from runner.trajectory import ObservedOutcome, ObservedToolCall, ObservedTrajectory
from scorers.models import FailureType


def limits() -> HarnessLimits:
    return HarnessLimits(
        max_concurrency=2,
        case_timeout_seconds=5,
        max_turns=4,
        max_tool_calls=4,
        max_subagents=1,
        max_cost=1,
        deepeval_batch_size=2,
        deepeval_async_mode=DeepEvalAsyncMode.SYNC,
        trials=1,
        random_seed=1,
    )


@dataclass
class FakeFixtures:
    cleanup_fails: bool = False
    calls: list[str] = field(default_factory=list[str])

    async def setup(self, case: EvalCase, *, owner: str) -> FixtureLease:
        self.calls.append(f"setup:{owner}")
        return FixtureLease(
            owner=owner,
            persona_alias=case.persona,
            organization_alias=case.organization_fixture,
        )

    async def observe(
        self,
        case: EvalCase,
        lease: FixtureLease,
    ) -> list[ObservedOutcome]:
        self.calls.append(f"observe:{lease.owner}")
        return [
            ObservedOutcome(
                source="tickets_api",
                payload={"ticket": {"title": "Renamed"}},
            )
        ]

    async def cleanup(self, case: EvalCase, lease: FixtureLease) -> None:
        self.calls.append(f"cleanup:{lease.owner}")
        if self.cleanup_fails:
            raise RuntimeError("cleanup failed")


@dataclass
class FakeExecutor:
    forbidden: bool = False

    async def execute(
        self,
        case: EvalCase,
        lease: FixtureLease,
    ) -> ObservedTrajectory:
        tool_name = "delete_ticket" if self.forbidden else "update_ticket"
        return ObservedTrajectory(
            case_id=case.id,
            thread_id=f"{lease.owner}:thread",
            run_ids=[f"{lease.owner}:run"],
            tools_called=[
                ObservedToolCall(
                    sequence=1,
                    name=tool_name,
                    arguments={"organizationId": "org-fixture"},
                )
            ],
            turns=1,
            latency_ms=50,
        )


class AuthDeniedExecutor:
    async def execute(
        self,
        case: EvalCase,
        lease: FixtureLease,
    ) -> ObservedTrajectory:
        del case, lease
        request = httpx.Request("POST", "http://agent.invalid/threads")
        response = httpx.Response(401, request=request)
        raise AuthenticationError(
            "authentication denied",
            response=response,
            body=None,
        )


def passing_case() -> EvalCase:
    return EvalCase.model_validate(
        {
            "id": "runner-pass",
            "version": "1.0.0",
            "input": ["rename ticket"],
            "persona": "member",
            "organization_fixture": "org-fixture",
            "expected_tools": {"tools": ["update_ticket"]},
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


def auth_denied_case() -> EvalCase:
    return EvalCase.model_validate(
        {
            "id": "runner-auth-denied",
            "version": "1.0.0",
            "tags": ["security"],
            "input": ["attempt protected access"],
            "persona": "expired-invalid-credential",
            "expected_execution": "auth_denied",
            "forbidden_tools": ["update_ticket", "delete_ticket"],
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


async def test_runner_orders_fixture_observation_judge_and_cleanup() -> None:
    fixtures = FakeFixtures()
    judge_calls: list[str] = []

    async def judge(
        case: EvalCase,
        trajectory: ObservedTrajectory,
    ) -> list[MetricResult]:
        judge_calls.append(case.id)
        assert trajectory.outcomes
        return [
            MetricResult(
                name="fixture-judge",
                status="passed",
                score=1,
                threshold=0.5,
            )
        ]

    result = await run_trial(
        passing_case(),
        trial=1,
        run_namespace="unit",
        limits=limits(),
        fixtures=fixtures,
        executor=FakeExecutor(),
        judge=judge,
    )

    assert result.passed
    assert judge_calls == ["runner-pass"]
    assert fixtures.calls == [
        "setup:unit:runner-pass:trial-1",
        "observe:unit:runner-pass:trial-1",
        "cleanup:unit:runner-pass:trial-1",
    ]


async def test_deterministic_failure_skips_judge_but_still_cleans_up() -> None:
    case = EvalCase.model_validate(
        {
            "id": "runner-security",
            "version": "1.0.0",
            "tags": ["security"],
            "input": ["do not delete"],
            "persona": "member",
            "forbidden_tools": ["delete_ticket"],
        }
    )
    fixtures = FakeFixtures()
    judge_called = False

    async def judge(
        case: EvalCase,
        trajectory: ObservedTrajectory,
    ) -> list[MetricResult]:
        nonlocal judge_called
        judge_called = True
        return []

    result = await run_trial(
        case,
        trial=1,
        run_namespace="unit",
        limits=limits(),
        fixtures=fixtures,
        executor=FakeExecutor(forbidden=True),
        judge=judge,
    )

    assert not result.passed
    assert FailureType.SECURITY_FAILURE in result.failure_types
    assert not judge_called
    assert fixtures.calls[-1] == "cleanup:unit:runner-security:trial-1"


async def test_expected_auth_denial_is_security_pass_and_still_observes_outcomes() -> None:
    fixtures = FakeFixtures()
    judge_called = False

    async def judge(
        case: EvalCase,
        trajectory: ObservedTrajectory,
    ) -> list[MetricResult]:
        del case, trajectory
        nonlocal judge_called
        judge_called = True
        return []

    result = await run_trial(
        auth_denied_case(),
        trial=1,
        run_namespace="unit",
        limits=limits(),
        fixtures=fixtures,
        executor=AuthDeniedExecutor(),
        judge=judge,
    )

    assert result.passed
    assert result.failure_types == []
    assert not judge_called
    assert any(
        item.name == "expected_execution:auth_denied" and item.passed
        for item in result.deterministic_assertions
    )
    assert fixtures.calls == [
        "setup:unit:runner-auth-denied:trial-1",
        "observe:unit:runner-auth-denied:trial-1",
        "cleanup:unit:runner-auth-denied:trial-1",
    ]


async def test_missing_expected_auth_denial_is_security_failure() -> None:
    result = await run_trial(
        auth_denied_case(),
        trial=1,
        run_namespace="unit",
        limits=limits(),
        fixtures=FakeFixtures(),
        executor=FakeExecutor(),
    )

    assert not result.passed
    assert FailureType.SECURITY_FAILURE in result.failure_types
    assert any(
        item.name == "expected_execution:auth_denied" and not item.passed
        for item in result.deterministic_assertions
    )


async def test_unexpected_auth_denial_is_auth_failure_not_infrastructure() -> None:
    fixtures = FakeFixtures()

    result = await run_trial(
        passing_case(),
        trial=1,
        run_namespace="unit",
        limits=limits(),
        fixtures=fixtures,
        executor=AuthDeniedExecutor(),
    )

    assert not result.passed
    assert result.failure_types == [FailureType.AUTH_FAILURE]
    assert not any(
        failure == FailureType.INFRASTRUCTURE_FAILURE
        for failure in result.failure_types
    )
    assert not any(call.startswith("observe:") for call in fixtures.calls)


async def test_cleanup_failure_is_infrastructure_failure() -> None:
    fixtures = FakeFixtures(cleanup_fails=True)

    result = await run_trial(
        passing_case(),
        trial=1,
        run_namespace="unit",
        limits=limits(),
        fixtures=fixtures,
        executor=FakeExecutor(),
    )

    assert not result.passed
    assert FailureType.INFRASTRUCTURE_FAILURE in result.failure_types
    assert result.infrastructure_notes == ["RuntimeError: fixture cleanup failed"]
