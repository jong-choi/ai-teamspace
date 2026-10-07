from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from scorers.models import AssertionResult, FailureType


class RunManifest(BaseModel):
    model_config = ConfigDict(frozen=True)

    repository_commit: str = Field(min_length=1, max_length=120)
    build_id: str | None = Field(default=None, max_length=120)
    server_runtime_version: str = Field(min_length=1, max_length=120)
    python_version: str = Field(min_length=1, max_length=80)
    dependency_versions: dict[str, str] = Field(default_factory=dict, max_length=128)
    model_provider: str | None = Field(default=None, max_length=120)
    model_name: str | None = Field(default=None, max_length=240)
    model_parameters: dict[str, str | int | float | bool | None] = Field(
        default_factory=dict,
        max_length=32,
    )
    prompt_hash: str | None = Field(default=None, max_length=128)
    agent_protocol_version: str = Field(min_length=1, max_length=80)
    mcp_protocol_version: str = Field(min_length=1, max_length=80)
    mcp_resource_alias: str = Field(min_length=1, max_length=120)
    tool_manifest_hash: str = Field(min_length=1, max_length=128)
    dataset_id: str = Field(min_length=1, max_length=128)
    dataset_version: str = Field(min_length=1, max_length=40)
    evaluator_version: str = Field(min_length=1, max_length=80)
    persona_aliases: list[str] = Field(default_factory=list, max_length=64)
    random_seed: int
    trial_count: int = Field(ge=1, le=50)
    timestamp: datetime
    langfuse_environment: str | None = Field(default=None, max_length=120)
    langfuse_project_alias: str | None = Field(default=None, max_length=120)


class MetricResult(BaseModel):
    model_config = ConfigDict(frozen=True)

    name: str = Field(min_length=1, max_length=160)
    status: str = Field(pattern=r"^(passed|failed|unsupported|skipped|error)$")
    score: float | None = None
    threshold: float | None = None
    reason: str | None = Field(default=None, max_length=1_000)


class LangfuseTraceLink(BaseModel):
    model_config = ConfigDict(frozen=True)

    run_id: str = Field(min_length=1, max_length=240)
    trace_id: str = Field(min_length=1, max_length=128)
    sampled: bool | None = None
    ui_url: str | None = Field(default=None, max_length=1_000)
    linkage_error: str | None = Field(default=None, max_length=500)


class TrajectorySummary(BaseModel):
    model_config = ConfigDict(frozen=True)

    thread_id: str = Field(min_length=1, max_length=240)
    run_ids: list[str] = Field(min_length=1, max_length=64)
    run_statuses: list[str] = Field(default_factory=list, max_length=64)
    event_kinds: list[str] = Field(default_factory=list, max_length=5_000)
    tools_called: list[str] = Field(default_factory=list, max_length=1_000)
    mcp_primitives_called: list[str] = Field(default_factory=list, max_length=1_000)
    turns: int = Field(ge=0)
    subagents: int = Field(ge=0)
    latency_ms: float = Field(ge=0)
    estimated_cost: float = Field(ge=0)


class TrialResult(BaseModel):
    model_config = ConfigDict(frozen=True)

    case_id: str = Field(min_length=1, max_length=128)
    trial: int = Field(ge=1, le=50)
    passed: bool
    failure_types: list[FailureType] = Field(
        default_factory=list[FailureType],
        max_length=32,
    )
    deterministic_assertions: list[AssertionResult] = Field(
        default_factory=list[AssertionResult],
        max_length=512,
    )
    metrics: list[MetricResult] = Field(
        default_factory=list[MetricResult],
        max_length=128,
    )
    trajectory: TrajectorySummary
    langfuse: list[LangfuseTraceLink] = Field(
        default_factory=list[LangfuseTraceLink],
        max_length=64,
    )
    infrastructure_notes: list[str] = Field(default_factory=list, max_length=32)


class EvalSummary(BaseModel):
    model_config = ConfigDict(frozen=True)

    case_count: int = Field(ge=0)
    trial_count: int = Field(ge=0)
    passed_trials: int = Field(ge=0)
    failed_trials: int = Field(ge=0)
    pass_rate: float = Field(ge=0, le=1)
    failure_counts: dict[str, int] = Field(default_factory=dict, max_length=64)
    case_pass_rates: dict[str, float] = Field(default_factory=dict, max_length=2_000)
    case_pass_at_least_one: dict[str, bool] = Field(
        default_factory=dict,
        max_length=2_000,
    )
    case_pass_all_trials: dict[str, bool] = Field(
        default_factory=dict,
        max_length=2_000,
    )
    flaky_cases: list[str] = Field(default_factory=list, max_length=2_000)
    latency_mean_ms: float = Field(default=0, ge=0)
    latency_median_ms: float = Field(default=0, ge=0)
    latency_p95_ms: float = Field(default=0, ge=0)
    estimated_cost_total: float = Field(default=0, ge=0)
    tool_call_counts: dict[str, int] = Field(default_factory=dict, max_length=1_000)


class EvalReport(BaseModel):
    model_config = ConfigDict(frozen=True)

    manifest: RunManifest
    summary: EvalSummary
    trials: list[TrialResult]
    baseline_diff: dict[str, Any] | None = None
