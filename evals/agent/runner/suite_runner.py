from __future__ import annotations

import asyncio

from config.models import HarnessLimits
from datasets.schema import EvalDataset
from fixtures.lifecycle import FixtureProvider
from reports.schema import TrialResult
from runner.case_runner import CaseExecutor, Judge, run_trial


async def run_dataset_trials(
    dataset: EvalDataset,
    *,
    run_namespace: str,
    limits: HarnessLimits,
    fixtures: FixtureProvider,
    executor: CaseExecutor,
    judge: Judge | None = None,
) -> list[TrialResult]:
    """Run all case/trial pairs with bounded concurrency and stable output order."""

    semaphore = asyncio.Semaphore(limits.max_concurrency)

    async def run_one(case_index: int, trial: int) -> TrialResult:
        case = dataset.cases[case_index]
        async with semaphore:
            return await run_trial(
                case,
                trial=trial,
                run_namespace=run_namespace,
                limits=limits,
                fixtures=fixtures,
                executor=executor,
                judge=judge,
            )

    jobs = [
        (case_index, trial)
        for case_index in range(len(dataset.cases))
        for trial in range(1, limits.trials + 1)
    ]
    return list(
        await asyncio.gather(
            *(run_one(case_index, trial) for case_index, trial in jobs)
        )
    )
