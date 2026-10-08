from __future__ import annotations

import asyncio
from collections.abc import Awaitable, Callable, Sequence
from typing import Any, Protocol

from deepeval.test_case import LLMTestCase, ToolCall

from datasets.schema import EvalCase
from metrics.eligibility import MetricSupport, metric_eligibility
from reports.redaction import redact_report_value
from reports.schema import MetricResult
from runner.trajectory import ObservedTrajectory


class StandaloneMetric(Protocol):
    # DeepEval metric은 측정 뒤 score/reason을 채우므로 adapter는 읽기만 한다.
    @property
    def threshold(self) -> float | None: ...

    @property
    def score(self) -> float | None: ...

    @property
    def reason(self) -> str | None: ...

    def measure(self, test_case: LLMTestCase, _show_indicator: bool = True) -> float: ...

    async def a_measure(
        self,
        test_case: LLMTestCase,
        _show_indicator: bool = True,
    ) -> float: ...


def to_deepeval_tool_call(name: str, arguments: dict[str, Any]) -> ToolCall:
    return ToolCall(name=name, input_parameters=arguments)


def to_llm_test_case(case: EvalCase, trajectory: ObservedTrajectory) -> LLMTestCase:
    expected = (
        [
            to_deepeval_tool_call(name, {})
            for name in case.expected_tools.tools
        ]
        if case.expected_tools
        else None
    )
    return LLMTestCase(
        name=case.id,
        input="\n\n".join(case.input),
        actual_output=trajectory.final_response or "",
        tools_called=[
            to_deepeval_tool_call(call.name, call.arguments)
            for call in trajectory.tools_called
        ],
        expected_tools=expected,
        token_cost=trajectory.estimated_cost,
        completion_time=trajectory.latency_ms / 1000,
        metadata={
            "case_id": case.id,
            "trajectory_source": "public-black-box",
            "reconstructed": False,
        },
        tags=case.tags,
    )


async def run_standalone_metric(
    name: str,
    metric: StandaloneMetric,
    test_case: LLMTestCase,
    *,
    async_mode: bool,
    timeout_seconds: float,
) -> MetricResult:
    eligibility = metric_eligibility(name)
    if eligibility.support != MetricSupport.STANDALONE:
        return MetricResult(
            name=name,
            status="unsupported",
            reason=eligibility.reason,
        )

    try:
        if async_mode:
            score = await asyncio.wait_for(
                metric.a_measure(test_case, _show_indicator=False),
                timeout=timeout_seconds,
            )
        else:
            score = await asyncio.wait_for(
                asyncio.to_thread(metric.measure, test_case, False),
                timeout=timeout_seconds,
            )
    except Exception as error:
        return MetricResult(
            name=name,
            status="error",
            reason=f"{type(error).__name__}: evaluator execution failed",
        )

    threshold = metric.threshold
    passed = bool(score >= threshold) if threshold is not None else True
    sanitized_reason = redact_report_value(metric.reason)
    reason = sanitized_reason if isinstance(sanitized_reason, str) else None
    return MetricResult(
        name=name,
        status="passed" if passed else "failed",
        score=float(score),
        threshold=threshold,
        reason=reason,
    )


def shard[T](values: Sequence[T], batch_size: int) -> list[list[T]]:
    if batch_size < 1:
        raise ValueError("batch_size must be >= 1")
    return [
        list(values[index : index + batch_size])
        for index in range(0, len(values), batch_size)
    ]


async def run_bounded_shards[T, R](
    values: Sequence[T],
    evaluator: Callable[[T], Awaitable[R]],
    *,
    batch_size: int,
    timeout_seconds: float,
) -> list[R]:
    results: list[R] = []
    for batch in shard(values, batch_size):
        batch_results = await asyncio.wait_for(
            asyncio.gather(*(evaluator(item) for item in batch)),
            timeout=timeout_seconds,
        )
        results.extend(batch_results)
    return results
