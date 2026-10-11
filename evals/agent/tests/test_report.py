from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path

import pytest

from config.settings import TEMP_ROOT
from reports.redaction import redact_report_value
from reports.render import summarize_trials, write_report
from reports.schema import EvalReport, RunManifest, TrajectorySummary, TrialResult
from scorers.models import AssertionResult, FailureType


def manifest() -> RunManifest:
    return RunManifest(
        repository_commit="abc123",
        server_runtime_version="server-test",
        python_version="3.12",
        dependency_versions={"deepeval": "4.2.8"},
        agent_protocol_version="v1",
        mcp_protocol_version="2026-07-28",
        mcp_resource_alias="teamspace",
        tool_manifest_hash="a" * 64,
        dataset_id="smoke",
        dataset_version="1.0.0",
        evaluator_version="0.1.0",
        persona_aliases=["read-only-member"],
        random_seed=1,
        trial_count=1,
        timestamp=datetime(2026, 10, 7, tzinfo=UTC),
    )


def trial() -> TrialResult:
    return TrialResult(
        case_id="schema-smoke",
        trial=1,
        passed=False,
        failure_types=[FailureType.SECURITY_FAILURE],
        deterministic_assertions=[
            AssertionResult(
                name="forbidden_tool",
                passed=False,
                failure_type=FailureType.SECURITY_FAILURE,
                message="authorization=Bearer report-secret-canary",
            )
        ],
        trajectory=TrajectorySummary(
            thread_id="thread-1",
            run_ids=["run-1"],
            event_kinds=["tool_call"],
            tools_called=["delete_ticket"],
            turns=1,
            subagents=0,
            latency_ms=10,
            estimated_cost=0,
        ),
    )


def test_report_redaction_removes_secrets_and_url_credentials() -> None:
    payload = redact_report_value(
        {
            "authorization": "Bearer top-secret",
            "nested": "api_key=key-secret",
            "url": "https://user:pass@example.com/path?access_token=x#debug",
        }
    )
    serialized = json.dumps(payload)
    assert "top-secret" not in serialized
    assert "key-secret" not in serialized
    assert "user:pass" not in serialized
    assert "access_token=x" not in serialized


def test_write_report_only_allows_temp_inside_repo(tmp_path: Path) -> None:
    item = trial()
    report = EvalReport(
        manifest=manifest(),
        summary=summarize_trials([item]),
        trials=[item],
    )

    with pytest.raises(ValueError, match="repo/.temp"):
        write_report(report, Path("generated-eval-output"))

    output = TEMP_ROOT / "agent" / "unit-report"
    json_path, markdown_path = write_report(report, output)
    serialized = json_path.read_text(encoding="utf-8")
    assert "report-secret-canary" not in serialized
    assert markdown_path.exists()
