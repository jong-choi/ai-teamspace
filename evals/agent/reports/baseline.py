from __future__ import annotations

import json
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from reports.schema import EvalReport


class BaselineCompatibility(BaseModel):
    model_config = ConfigDict(frozen=True)

    compatible: bool
    reasons: list[str] = Field(default_factory=list, max_length=64)


class BaselineDiff(BaseModel):
    model_config = ConfigDict(frozen=True)

    baseline_id: str = Field(min_length=1, max_length=120)
    status: Literal["comparable", "incompatible"]
    compatibility_reasons: list[str] = Field(default_factory=list, max_length=64)
    pass_rate_delta: float | None = None
    failed_trial_delta: int | None = None
    latency_p95_delta_ms: float | None = None
    estimated_cost_delta: float | None = None
    case_pass_rate_delta: dict[str, float] = Field(
        default_factory=dict,
        max_length=2_000,
    )
    failure_count_delta: dict[str, int] = Field(
        default_factory=dict,
        max_length=64,
    )
    tool_call_count_delta: dict[str, int] = Field(
        default_factory=dict,
        max_length=1_000,
    )
    newly_failing_trials: list[str] = Field(default_factory=list, max_length=2_000)
    resolved_trials: list[str] = Field(default_factory=list, max_length=2_000)


def compare_manifest_compatibility(
    baseline: EvalReport,
    candidate: EvalReport,
) -> BaselineCompatibility:
    left = baseline.manifest
    right = candidate.manifest
    checks = {
        "dataset": (
            (left.dataset_id, left.dataset_version),
            (right.dataset_id, right.dataset_version),
        ),
        "tool_manifest_hash": (left.tool_manifest_hash, right.tool_manifest_hash),
        "agent_protocol_version": (
            left.agent_protocol_version,
            right.agent_protocol_version,
        ),
        "mcp_protocol_version": (
            left.mcp_protocol_version,
            right.mcp_protocol_version,
        ),
        "model": (
            (left.model_provider, left.model_name, left.model_parameters),
            (right.model_provider, right.model_name, right.model_parameters),
        ),
        "prompt_hash": (left.prompt_hash, right.prompt_hash),
        "evaluator_version": (
            left.evaluator_version,
            right.evaluator_version,
        ),
        "personas": (left.persona_aliases, right.persona_aliases),
        "trial_count": (left.trial_count, right.trial_count),
        "random_seed": (left.random_seed, right.random_seed),
    }
    reasons = [
        f"{name} differs"
        for name, (baseline_value, candidate_value) in checks.items()
        if baseline_value != candidate_value
    ]
    return BaselineCompatibility(compatible=not reasons, reasons=reasons)


def load_report(path: Path) -> EvalReport:
    if path.suffix.lower() != ".json":
        raise ValueError("baseline report must be JSON")
    raw: object = json.loads(path.read_text(encoding="utf-8"))
    return EvalReport.model_validate(raw)


def _trial_passes(report: EvalReport) -> dict[str, bool]:
    values: dict[str, bool] = {}
    for trial in report.trials:
        key = f"{trial.case_id}#trial-{trial.trial}"
        if key in values:
            raise ValueError(f"duplicate trial key in report: {key}")
        values[key] = trial.passed
    return values


def _int_delta(
    baseline: dict[str, int],
    candidate: dict[str, int],
) -> dict[str, int]:
    return {
        key: candidate.get(key, 0) - baseline.get(key, 0)
        for key in sorted(set(baseline) | set(candidate))
        if candidate.get(key, 0) != baseline.get(key, 0)
    }


def compare_reports(
    baseline: EvalReport,
    candidate: EvalReport,
    *,
    baseline_id: str,
) -> BaselineDiff:
    compatibility = compare_manifest_compatibility(baseline, candidate)
    baseline_trials = _trial_passes(baseline)
    candidate_trials = _trial_passes(candidate)

    reasons = list(compatibility.reasons)
    if baseline_trials.keys() != candidate_trials.keys():
        reasons.append("trial set differs")

    if reasons:
        return BaselineDiff(
            baseline_id=baseline_id,
            status="incompatible",
            compatibility_reasons=reasons,
        )

    case_ids = sorted(
        set(baseline.summary.case_pass_rates)
        | set(candidate.summary.case_pass_rates)
    )
    case_pass_rate_delta = {
        case_id: (
            candidate.summary.case_pass_rates.get(case_id, 0)
            - baseline.summary.case_pass_rates.get(case_id, 0)
        )
        for case_id in case_ids
    }

    newly_failing = sorted(
        key
        for key, baseline_passed in baseline_trials.items()
        if baseline_passed and not candidate_trials[key]
    )
    resolved = sorted(
        key
        for key, baseline_passed in baseline_trials.items()
        if not baseline_passed and candidate_trials[key]
    )

    return BaselineDiff(
        baseline_id=baseline_id,
        status="comparable",
        pass_rate_delta=candidate.summary.pass_rate - baseline.summary.pass_rate,
        failed_trial_delta=(
            candidate.summary.failed_trials - baseline.summary.failed_trials
        ),
        latency_p95_delta_ms=(
            candidate.summary.latency_p95_ms - baseline.summary.latency_p95_ms
        ),
        estimated_cost_delta=(
            candidate.summary.estimated_cost_total
            - baseline.summary.estimated_cost_total
        ),
        case_pass_rate_delta=case_pass_rate_delta,
        failure_count_delta=_int_delta(
            baseline.summary.failure_counts,
            candidate.summary.failure_counts,
        ),
        tool_call_count_delta=_int_delta(
            baseline.summary.tool_call_counts,
            candidate.summary.tool_call_counts,
        ),
        newly_failing_trials=newly_failing,
        resolved_trials=resolved,
    )
