from __future__ import annotations

import asyncio
from collections.abc import Awaitable, Callable
from typing import Protocol

from langgraph_sdk.errors import AuthenticationError, PermissionDeniedError

from config.models import HarnessLimits
from datasets.schema import EvalCase, ExecutionExpectation
from fixtures.lifecycle import FixtureLease, FixtureProvider, fixture_owner
from reports.render import summarize_trajectory
from reports.schema import MetricResult, TrialResult
from runner.trajectory import ObservedTrajectory
from scorers.deterministic import score_deterministic
from scorers.models import AssertionResult, FailureType

Judge = Callable[[EvalCase, ObservedTrajectory], Awaitable[list[MetricResult]]]


class CaseExecutor(Protocol):
    async def execute(
        self,
        case: EvalCase,
        lease: FixtureLease,
    ) -> ObservedTrajectory: ...


def _empty_trajectory(case: EvalCase, owner: str) -> ObservedTrajectory:
    return ObservedTrajectory(
        case_id=case.id,
        thread_id=f"{owner}:not-started",
        run_ids=[f"{owner}:not-started"],
    )


def _infrastructure_assertion(name: str, message: str) -> AssertionResult:
    return AssertionResult(
        name=name,
        passed=False,
        failure_type=FailureType.INFRASTRUCTURE_FAILURE,
        message=message[:500],
    )


def _auth_failure_type(case: EvalCase) -> FailureType:
    if "security" in case.tags:
        return FailureType.SECURITY_FAILURE
    return FailureType.AUTH_FAILURE


def _auth_assertion(
    case: EvalCase,
    *,
    passed: bool,
    message: str,
) -> AssertionResult:
    return AssertionResult(
        name="expected_execution:auth_denied",
        passed=passed,
        failure_type=None if passed else _auth_failure_type(case),
        message=message[:500],
    )


async def run_trial(
    case: EvalCase,
    *,
    trial: int,
    run_namespace: str,
    limits: HarnessLimits,
    fixtures: FixtureProvider,
    executor: CaseExecutor,
    judge: Judge | None = None,
) -> TrialResult:
    owner = fixture_owner(run_namespace, case.id, trial)
    lease: FixtureLease | None = None
    trajectory = _empty_trajectory(case, owner)
    assertions: list[AssertionResult] = []
    metrics: list[MetricResult] = []
    failures: list[FailureType] = []
    infrastructure_notes: list[str] = []

    timeout_seconds = case.budget.timeout_seconds or limits.case_timeout_seconds
    blocking_failure = False

    try:
        lease = await fixtures.setup(case, owner=owner)
        try:
            trajectory = await asyncio.wait_for(
                executor.execute(case, lease),
                timeout=timeout_seconds,
            )
        except TimeoutError:
            blocking_failure = True
            failures.append(FailureType.BUDGET_TIMEOUT)
            assertions.append(
                AssertionResult(
                    name="case_execution_timeout",
                    passed=False,
                    failure_type=FailureType.BUDGET_TIMEOUT,
                    message=f"case exceeded {timeout_seconds}s execution timeout",
                )
            )
        except (AuthenticationError, PermissionDeniedError) as error:
            expected_denial = (
                case.expected_execution == ExecutionExpectation.AUTH_DENIED
            )
            assertions.append(
                _auth_assertion(
                    case,
                    passed=expected_denial,
                    message=(
                        f"Agent Protocol rejected execution with HTTP "
                        f"{error.status_code}"
                    ),
                )
            )
            if not expected_denial:
                blocking_failure = True
                failures.append(_auth_failure_type(case))
        except Exception as error:
            blocking_failure = True
            failures.append(FailureType.INFRASTRUCTURE_FAILURE)
            assertions.append(
                _infrastructure_assertion(
                    "case_execution",
                    f"{type(error).__name__}: executor failed",
                )
            )
        else:
            if case.expected_execution == ExecutionExpectation.AUTH_DENIED:
                failure_type = _auth_failure_type(case)
                failures.append(failure_type)
                assertions.append(
                    _auth_assertion(
                        case,
                        passed=False,
                        message="Agent Protocol execution succeeded but auth denial was required",
                    )
                )

        if not blocking_failure:
            try:
                outcomes = await fixtures.observe(case, lease)
                trajectory = trajectory.model_copy(update={"outcomes": outcomes})
            except Exception as error:
                blocking_failure = True
                failures.append(FailureType.INFRASTRUCTURE_FAILURE)
                assertions.append(
                    _infrastructure_assertion(
                        "fixture_observe",
                        f"{type(error).__name__}: public outcome observation failed",
                    )
                )

        if not blocking_failure:
            deterministic = score_deterministic(case, trajectory, limits)
            assertions.extend(deterministic.assertions)
            failures.extend(
                result.failure_type
                for result in deterministic.failures()
                if result.critical and result.failure_type is not None
            )

            if (
                deterministic.passed
                and not failures
                and judge is not None
                and case.expected_execution == ExecutionExpectation.SUCCESS
            ):
                try:
                    metrics = await asyncio.wait_for(
                        judge(case, trajectory),
                        timeout=timeout_seconds,
                    )
                except Exception as error:
                    failures.append(FailureType.INFRASTRUCTURE_FAILURE)
                    infrastructure_notes.append(
                        f"{type(error).__name__}: judge/evaluator failed"
                    )
    except Exception as error:
        failures.append(FailureType.INFRASTRUCTURE_FAILURE)
        assertions.append(
            _infrastructure_assertion(
                "fixture_setup",
                f"{type(error).__name__}: fixture setup failed",
            )
        )
    finally:
        if lease is not None:
            try:
                await fixtures.cleanup(case, lease)
            except Exception as error:
                failures.append(FailureType.INFRASTRUCTURE_FAILURE)
                infrastructure_notes.append(
                    f"{type(error).__name__}: fixture cleanup failed"
                )

    unique_failures = list(dict.fromkeys(failures))
    return TrialResult(
        case_id=case.id,
        trial=trial,
        passed=not unique_failures,
        failure_types=unique_failures,
        deterministic_assertions=assertions,
        metrics=metrics,
        trajectory=summarize_trajectory(trajectory),
        infrastructure_notes=infrastructure_notes,
    )
