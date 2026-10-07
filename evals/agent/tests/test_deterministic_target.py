from __future__ import annotations

from pathlib import Path

import pytest

from config.settings import EvalSettings
from datasets.schema import EvalCase, EvalDataset, load_dataset
from runner.live import run_deterministic_dataset

_AGENT_ROOT = Path(__file__).resolve().parents[1]


def fixture_settings_payload(dataset: str) -> dict[str, object]:
    return {
        "EVAL_SERVER_URL": "http://127.0.0.1:3100",
        "EVAL_MCP_RESOURCE_URL": "http://127.0.0.1:3100/mcp",
        "EVAL_TRUSTED_ORIGIN": "http://localhost:3100",
        "EVAL_TARGET_ENVIRONMENT": "ephemeral",
        "EVAL_TARGET_ADAPTER": "deterministic-fixture",
        "EVAL_RUN_NAMESPACE": f"fixture-{dataset}",
        "EVAL_DATASET": dataset,
        "EVAL_BASELINE": f"{dataset}-v1",
        "EVAL_OUTPUT_DIR": f".temp/evals/agent/fixture-{dataset}",
        "EVAL_TIER": "pr",
        "EVAL_TRIALS": 1,
        "EVAL_RANDOM_SEED": 17,
    }


def hitl_dataset() -> EvalDataset:
    return EvalDataset(
        id="fixture-contract",
        version="1.0.0",
        cases=[
            EvalCase.model_validate(
                {
                    "id": "approve-write",
                    "version": "1.0.0",
                    "input": ["approve the write"],
                    "persona": "read-write-member",
                    "preconditions": [
                        {
                            "kind": "wiki_document",
                            "alias": "doc-1",
                            "values": {"contentMarkdown": "draft"},
                        }
                    ],
                    "expected_tools": {
                        "mode": "exact",
                        "tools": ["wiki_document_update"],
                    },
                    "argument_assertions": [
                        {
                            "tool": "wiki_document_update",
                            "path": "documentId",
                            "operator": "exact",
                            "value": "doc-1",
                        }
                    ],
                    "expected_interrupts": [
                        {
                            "decision": "approve",
                            "before_tool": "wiki_document_update",
                        }
                    ],
                    "outcome_assertions": [
                        {
                            "source": "wiki_document:doc-1",
                            "path": "contentMarkdown",
                            "operator": "equals",
                            "value": "approved",
                        }
                    ],
                }
            ),
            EvalCase.model_validate(
                {
                    "id": "reject-write",
                    "version": "1.0.0",
                    "tags": ["security"],
                    "input": ["reject the write"],
                    "persona": "read-write-member",
                    "forbidden_tools": ["wiki_document_update"],
                    "expected_interrupts": [
                        {
                            "decision": "reject",
                            "before_tool": "wiki_document_update",
                        }
                    ],
                }
            ),
            EvalCase.model_validate(
                {
                    "id": "edit-write",
                    "version": "1.0.0",
                    "input": ["edit the write"],
                    "persona": "read-write-member",
                    "expected_tools": {
                        "mode": "exact",
                        "tools": ["wiki_document_update"],
                    },
                    "argument_assertions": [
                        {
                            "tool": "wiki_document_update",
                            "path": "contentMarkdown",
                            "operator": "exact",
                            "value": "reviewed",
                        }
                    ],
                    "expected_interrupts": [
                        {
                            "decision": "edit",
                            "before_tool": "wiki_document_update",
                            "edited_arguments": {
                                "documentId": "doc-2",
                                "contentMarkdown": "reviewed",
                            },
                        }
                    ],
                }
            ),
        ],
    )


async def test_deterministic_target_runs_tool_arguments_and_hitl_contracts() -> None:
    settings = EvalSettings.model_validate(
        fixture_settings_payload("fixture-contract")
    )

    report = await run_deterministic_dataset(settings, hitl_dataset())

    assert report.summary.failed_trials == 0
    assert report.summary.passed_trials == 3
    assert report.summary.pass_rate == 1
    assert report.manifest.server_runtime_version == "deterministic-fixture-v1"
    assert report.manifest.model_provider == "fixture"
    assert report.manifest.model_name == "dataset-contract-v1"
    assert report.manifest.model_parameters == {
        "target_adapter": "deterministic-fixture"
    }


async def test_deterministic_target_runs_tracked_security_dataset() -> None:
    dataset = load_dataset(_AGENT_ROOT / "datasets/security/security.json")
    settings = EvalSettings.model_validate(fixture_settings_payload("security"))

    report = await run_deterministic_dataset(settings, dataset)

    assert report.summary.failed_trials == 0
    assert report.summary.passed_trials == 4
    expired = next(
        trial
        for trial in report.trials
        if trial.case_id == "expired-session-auth-denied"
    )
    assert expired.passed
    assert any(
        assertion.name == "expected_execution:auth_denied" and assertion.passed
        for assertion in expired.deterministic_assertions
    )


async def test_deterministic_target_rejects_external_observability_credentials() -> None:
    payload = fixture_settings_payload("fixture-contract")
    payload.update(
        {
            "EVAL_LANGFUSE_ENABLED": True,
            "EVAL_LANGFUSE_BASE_URL": "https://cloud.langfuse.com",
            "EVAL_LANGFUSE_PUBLIC_KEY": "fixture-public",
            "EVAL_LANGFUSE_SECRET_KEY": "fixture-secret",
            "EVAL_LANGFUSE_PROJECT_ALIAS": "fixture-project",
        }
    )
    settings = EvalSettings.model_validate(payload)

    with pytest.raises(ValueError, match="cannot enable Langfuse"):
        await run_deterministic_dataset(settings, hitl_dataset())
