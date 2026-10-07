from __future__ import annotations

import json
import math
import statistics
from collections import Counter
from pathlib import Path
from typing import Any, cast

from config.settings import REPO_ROOT, TEMP_ROOT
from reports.redaction import redact_report_value
from reports.schema import EvalReport, EvalSummary, TrajectorySummary, TrialResult
from runner.trajectory import ObservedTrajectory


def summarize_trajectory(trajectory: ObservedTrajectory) -> TrajectorySummary:
    return TrajectorySummary(
        thread_id=trajectory.thread_id,
        run_ids=trajectory.run_ids,
        run_statuses=trajectory.run_statuses,
        event_kinds=[event.kind.value for event in trajectory.events],
        tools_called=[call.name for call in trajectory.tools_called],
        mcp_primitives_called=[
            f"{call.server_alias}:{call.primitive}"
            + (f":{call.name}" if call.name else "")
            for call in trajectory.mcp_primitives_called
        ],
        turns=trajectory.turns,
        subagents=trajectory.subagents,
        latency_ms=trajectory.latency_ms,
        estimated_cost=trajectory.estimated_cost,
    )


def summarize_trials(trials: list[TrialResult]) -> EvalSummary:
    passed = sum(1 for trial in trials if trial.passed)
    failure_counts: Counter[str] = Counter()
    tool_call_counts: Counter[str] = Counter()
    case_outcomes: dict[str, list[bool]] = {}
    latencies: list[float] = []

    for trial in trials:
        failure_counts.update(failure.value for failure in trial.failure_types)
        tool_call_counts.update(trial.trajectory.tools_called)
        case_outcomes.setdefault(trial.case_id, []).append(trial.passed)
        if any(
            not run_id.endswith(":not-started")
            for run_id in trial.trajectory.run_ids
        ):
            latencies.append(trial.trajectory.latency_ms)

    case_pass_rates = {
        case_id: sum(outcomes) / len(outcomes)
        for case_id, outcomes in sorted(case_outcomes.items())
    }
    case_pass_at_least_one = {
        case_id: any(outcomes)
        for case_id, outcomes in sorted(case_outcomes.items())
    }
    case_pass_all_trials = {
        case_id: all(outcomes)
        for case_id, outcomes in sorted(case_outcomes.items())
    }
    flaky_cases = sorted(
        case_id
        for case_id, outcomes in case_outcomes.items()
        if any(outcomes) and not all(outcomes)
    )

    sorted_latencies = sorted(latencies)
    p95_index = (
        max(0, math.ceil(0.95 * len(sorted_latencies)) - 1)
        if sorted_latencies
        else 0
    )
    total = len(trials)
    return EvalSummary(
        case_count=len(case_outcomes),
        trial_count=total,
        passed_trials=passed,
        failed_trials=total - passed,
        pass_rate=(passed / total if total else 0),
        failure_counts=dict(sorted(failure_counts.items())),
        case_pass_rates=case_pass_rates,
        case_pass_at_least_one=case_pass_at_least_one,
        case_pass_all_trials=case_pass_all_trials,
        flaky_cases=flaky_cases,
        latency_mean_ms=(statistics.mean(latencies) if latencies else 0),
        latency_median_ms=(statistics.median(latencies) if latencies else 0),
        latency_p95_ms=(sorted_latencies[p95_index] if sorted_latencies else 0),
        estimated_cost_total=sum(
            trial.trajectory.estimated_cost for trial in trials
        ),
        tool_call_counts=dict(sorted(tool_call_counts.items())),
    )


def _validate_output_dir(output_dir: Path) -> Path:
    resolved = output_dir.expanduser().resolve()
    if resolved == REPO_ROOT or REPO_ROOT in resolved.parents:
        if resolved != TEMP_ROOT and TEMP_ROOT not in resolved.parents:
            raise ValueError(
                "generated eval reports inside the repository must be under repo/.temp"
            )
    return resolved


def _safe_report_payload(report: EvalReport) -> dict[str, Any]:
    raw = report.model_dump(mode="json")
    sanitized = redact_report_value(raw)
    if not isinstance(sanitized, dict):
        raise TypeError("sanitized report payload must remain an object")
    return cast(dict[str, Any], sanitized)


def render_markdown(report: EvalReport) -> str:
    lines = [
        "# Agent evaluation report",
        "",
        f"- Dataset: {report.manifest.dataset_id}@{report.manifest.dataset_version}",
        f"- Commit: {report.manifest.repository_commit}",
        f"- Trials: {report.summary.trial_count}",
        f"- Pass rate: {report.summary.pass_rate:.1%}",
        f"- Flaky cases: {len(report.summary.flaky_cases)}",
        (
            "- Latency mean/median/p95: "
            f"{report.summary.latency_mean_ms:.1f} / "
            f"{report.summary.latency_median_ms:.1f} / "
            f"{report.summary.latency_p95_ms:.1f} ms"
        ),
        f"- Estimated cost total: {report.summary.estimated_cost_total:.6f}",
        "",
        "## Cases",
        "",
        "| Case | Trial | Result | Failures |",
        "| --- | ---: | --- | --- |",
    ]
    for trial in report.trials:
        failures = ", ".join(failure.value for failure in trial.failure_types) or "-"
        result = "PASS" if trial.passed else "FAIL"
        lines.append(f"| {trial.case_id} | {trial.trial} | {result} | {failures} |")

    unsupported = sorted(
        {
            metric.name
            for trial in report.trials
            for metric in trial.metrics
            if metric.status in {"unsupported", "skipped"}
        }
    )
    if unsupported:
        lines.extend(
            [
                "",
                "## Unsupported/skipped metrics",
                "",
                *[f"- {name}" for name in unsupported],
            ]
        )

    return "\n".join(lines) + "\n"


def write_report(report: EvalReport, output_dir: Path) -> tuple[Path, Path]:
    directory = _validate_output_dir(output_dir)
    directory.mkdir(parents=True, exist_ok=True)

    json_path = directory / "report.json"
    markdown_path = directory / "report.md"

    payload = _safe_report_payload(report)
    json_path.write_text(
        json.dumps(payload, indent=2, sort_keys=True, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    markdown_path.write_text(render_markdown(report), encoding="utf-8")
    return json_path, markdown_path
