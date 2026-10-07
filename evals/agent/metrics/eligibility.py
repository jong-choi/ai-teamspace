from __future__ import annotations

from enum import StrEnum

from pydantic import BaseModel, ConfigDict, Field


class MetricSupport(StrEnum):
    STANDALONE = "standalone"
    RECONSTRUCTED_TRACE = "reconstructed_trace"
    UNSUPPORTED = "unsupported"


class MetricEligibility(BaseModel):
    model_config = ConfigDict(frozen=True)

    name: str = Field(min_length=1, max_length=160)
    support: MetricSupport
    reason: str = Field(max_length=500)


STANDALONE_METRICS = frozenset(
    {
        "ToolCorrectnessMetric",
        "ArgumentCorrectnessMetric",
        "ToolPermissionMetric",
        "MCPUseMetric",
        "ToolUseMetric",
        "MCPTaskCompletionMetric",
    }
)

TRACE_ONLY_METRICS = frozenset(
    {
        "TaskCompletionMetric",
        "StepEfficiencyMetric",
        "PlanAdherenceMetric",
        "PlanQualityMetric",
        "AgentLoopDetectionMetric",
    }
)

PLAN_METRICS = frozenset({"PlanAdherenceMetric", "PlanQualityMetric"})


def metric_eligibility(
    name: str,
    *,
    reconstructed_trace: bool = False,
    public_plan_observable: bool = False,
) -> MetricEligibility:
    if name in STANDALONE_METRICS:
        return MetricEligibility(
            name=name,
            support=MetricSupport.STANDALONE,
            reason="metric accepts explicit black-box test-case inputs",
        )
    if name in TRACE_ONLY_METRICS:
        if not reconstructed_trace:
            return MetricEligibility(
                name=name,
                support=MetricSupport.UNSUPPORTED,
                reason=(
                    "metric requires a DeepEval trace; "
                    "production is not instrumented by DeepEval"
                ),
            )
        if name in PLAN_METRICS and not public_plan_observable:
            return MetricEligibility(
                name=name,
                support=MetricSupport.UNSUPPORTED,
                reason="public trajectory does not expose plan/reasoning semantics",
            )
        return MetricEligibility(
            name=name,
            support=MetricSupport.RECONSTRUCTED_TRACE,
            reason="eligible only against an explicitly reconstructed public-observation trace",
        )
    return MetricEligibility(
        name=name,
        support=MetricSupport.UNSUPPORTED,
        reason="metric is not in the reviewed v1 allowlist",
    )
