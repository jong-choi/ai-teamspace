from __future__ import annotations

import asyncio

from config.models import DeepEvalAsyncMode, HarnessLimits
from datasets.schema import EvalCase, EvalDataset
from fixtures.lifecycle import FixtureLease
from runner.suite_runner import run_dataset_trials
from runner.trajectory import ObservedOutcome, ObservedTrajectory


def limits() -> HarnessLimits:
    return HarnessLimits(
        max_concurrency=2,
        case_timeout_seconds=5,
        max_turns=4,
        max_tool_calls=4,
        max_subagents=2,
        max_cost=1,
        deepeval_batch_size=2,
        deepeval_async_mode=DeepEvalAsyncMode.SYNC,
        trials=2,
        random_seed=7,
    )


class FakeFixtures:
    async def setup(self, case: EvalCase, *, owner: str) -> FixtureLease:
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
        del case, lease
        return []

    async def cleanup(self, case: EvalCase, lease: FixtureLease) -> None:
        del case, lease


class ConcurrentExecutor:
    def __init__(self) -> None:
        self.active = 0
        self.max_active = 0

    async def execute(
        self,
        case: EvalCase,
        lease: FixtureLease,
    ) -> ObservedTrajectory:
        self.active += 1
        self.max_active = max(self.max_active, self.active)
        try:
            if case.id == "case-a" and lease.owner.endswith("trial-1"):
                await asyncio.sleep(0.03)
            else:
                await asyncio.sleep(0.01)
            return ObservedTrajectory(
                case_id=case.id,
                thread_id=f"{lease.owner}:thread",
                run_ids=[f"{lease.owner}:run"],
                run_statuses=["success"],
                final_response="ok",
                turns=1,
                latency_ms=10,
            )
        finally:
            self.active -= 1


async def test_suite_runner_bounds_concurrency_and_preserves_job_order() -> None:
    dataset = EvalDataset(
        id="suite",
        version="1.0.0",
        cases=[
            EvalCase(
                id="case-a",
                version="1.0.0",
                input=["a"],
                persona="member",
            ),
            EvalCase(
                id="case-b",
                version="1.0.0",
                input=["b"],
                persona="operator",
            ),
        ],
    )
    executor = ConcurrentExecutor()

    results = await run_dataset_trials(
        dataset,
        run_namespace="unit",
        limits=limits(),
        fixtures=FakeFixtures(),
        executor=executor,
    )

    assert [(result.case_id, result.trial) for result in results] == [
        ("case-a", 1),
        ("case-a", 2),
        ("case-b", 1),
        ("case-b", 2),
    ]
    assert all(result.passed for result in results)
    assert executor.max_active == 2
