from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path

import pytest

from reports.baseline import compare_reports, load_report
from reports.render import summarize_trials
from reports.schema import EvalReport, RunManifest, TrajectorySummary, TrialResult
from scorers.models import FailureType


def manifest(*, tool_hash: str = "a" * 64, seed: int = 1) -> RunManifest:
    return RunManifest(
        repository_commit="abc123",
        server_runtime_version="server-test",
        python_version="3.12",
        dependency_versions={"deepeval": "4.2.8"},
        agent_protocol_version="v1",
        mcp_protocol_version="2026-07-28",
        mcp_resource_alias="teamspace",
        tool_manifest_hash=tool_hash,
        dataset_id="routing",
        dataset_version="1.0.0",
        evaluator_version="0.1.0",
        persona_aliases=["read-write-member"],
        random_seed=seed,
        trial_count=2,
        timestamp=datetime(2026, 10, 8, tzinfo=UTC),
    )


def trial(
    number: int,
    *,
    passed: bool,
    latency_ms: float,
    tools: list[str],
    cost: float = 0,
) -> TrialResult:
    return TrialResult(
        case_id="case-a",
        trial=number,
        passed=passed,
        failure_types=[] if passed else [FailureType.TOOL_EXECUTION_FAILURE],
        trajectory=TrajectorySummary(
            thread_id=f"thread-{number}",
            run_ids=[f"run-{number}"],
            run_statuses=["success" if passed else "error"],
            tools_called=tools,
            turns=1,
            subagents=0,
            latency_ms=latency_ms,
            estimated_cost=cost,
        ),
    )


def report(
    trials: list[TrialResult],
    *,
    tool_hash: str = "a" * 64,
    seed: int = 1,
) -> EvalReport:
    return EvalReport(
        manifest=manifest(tool_hash=tool_hash, seed=seed),
        summary=summarize_trials(trials),
        trials=trials,
    )


def test_repeated_trial_summary_reports_distribution_latency_cost_and_tools() -> None:
    summary = summarize_trials(
        [
            trial(1, passed=True, latency_ms=10, tools=["wiki_get"], cost=0.1),
            trial(
                2,
                passed=False,
                latency_ms=30,
                tools=["wiki_get", "wiki_update"],
                cost=0.2,
            ),
        ]
    )

    assert summary.pass_rate == 0.5
    assert summary.case_pass_rates == {"case-a": 0.5}
    assert summary.case_pass_at_least_one == {"case-a": True}
    assert summary.case_pass_all_trials == {"case-a": False}
    assert summary.flaky_cases == ["case-a"]
    assert summary.latency_mean_ms == 20
    assert summary.latency_median_ms == 20
    assert summary.latency_p95_ms == 30
    assert summary.estimated_cost_total == pytest.approx(0.3)
    assert summary.tool_call_counts == {
        "wiki_get": 2,
        "wiki_update": 1,
    }


def test_compare_reports_computes_only_apples_to_apples_deltas() -> None:
    baseline = report(
        [
            trial(1, passed=True, latency_ms=10, tools=["wiki_get"]),
            trial(2, passed=True, latency_ms=20, tools=["wiki_get"]),
        ]
    )
    candidate = report(
        [
            trial(1, passed=True, latency_ms=10, tools=["wiki_get"]),
            trial(
                2,
                passed=False,
                latency_ms=30,
                tools=["wiki_get", "wiki_update"],
            ),
        ]
    )

    diff = compare_reports(baseline, candidate, baseline_id="routing-v1")

    assert diff.status == "comparable"
    assert diff.compatibility_reasons == []
    assert diff.pass_rate_delta == -0.5
    assert diff.failed_trial_delta == 1
    assert diff.latency_p95_delta_ms == 10
    assert diff.case_pass_rate_delta == {"case-a": -0.5}
    assert diff.newly_failing_trials == ["case-a#trial-2"]
    assert diff.resolved_trials == []
    assert diff.tool_call_count_delta == {"wiki_update": 1}


def test_compare_reports_marks_manifest_mismatch_incompatible() -> None:
    baseline = report(
        [
            trial(1, passed=True, latency_ms=10, tools=[]),
            trial(2, passed=True, latency_ms=10, tools=[]),
        ]
    )
    candidate = report(
        [
            trial(1, passed=True, latency_ms=10, tools=[]),
            trial(2, passed=True, latency_ms=10, tools=[]),
        ],
        tool_hash="b" * 64,
        seed=2,
    )

    diff = compare_reports(baseline, candidate, baseline_id="routing-v1")

    assert diff.status == "incompatible"
    assert "tool_manifest_hash differs" in diff.compatibility_reasons
    assert "random_seed differs" in diff.compatibility_reasons
    assert diff.pass_rate_delta is None


def test_load_report_round_trips_machine_report(tmp_path: Path) -> None:
    baseline = report(
        [
            trial(1, passed=True, latency_ms=10, tools=[]),
            trial(2, passed=True, latency_ms=20, tools=[]),
        ]
    )
    path = tmp_path / "baseline.json"
    path.write_text(baseline.model_dump_json(indent=2), encoding="utf-8")

    loaded = load_report(path)

    assert loaded == baseline
