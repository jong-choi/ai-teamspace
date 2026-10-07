from __future__ import annotations

from datetime import UTC, datetime

import pytest

from config.settings import EvalSettings
from datasets.schema import EvalCase, EvalDataset
from runner.live import LiveDiscovery, build_run_manifest, run_live_dataset


def settings_payload() -> dict[str, object]:
    return {
        "EVAL_SERVER_URL": "http://127.0.0.1:3100",
        "EVAL_MCP_RESOURCE_URL": "http://127.0.0.1:3100/mcp",
        "EVAL_TRUSTED_ORIGIN": "http://localhost:3100",
        "EVAL_TARGET_ENVIRONMENT": "ephemeral",
        "EVAL_RUN_NAMESPACE": "live-unit",
        "EVAL_DATASET": "smoke",
        "EVAL_BASELINE": "smoke-v1",
        "EVAL_OUTPUT_DIR": ".temp/evals/agent/live-unit",
        "EVAL_TRIALS": 2,
        "EVAL_RANDOM_SEED": 13,
    }


def dataset() -> EvalDataset:
    return EvalDataset(
        id="smoke",
        version="1.2.3",
        cases=[
            EvalCase(
                id="read",
                version="1.0.0",
                input=["read"],
                persona="member",
            ),
            EvalCase(
                id="write",
                version="1.0.0",
                input=["write"],
                persona="operator",
            ),
        ],
    )


def test_build_run_manifest_uses_canonical_personas_and_live_protocol_data() -> None:
    settings = EvalSettings.model_validate(settings_payload())
    discovery = LiveDiscovery(
        server_runtime_version="server-1",
        agent_protocol_version="v1",
        mcp_protocol_version="2026-07-28",
        mcp_resource_alias="work-os",
        tool_manifest_hash="a" * 64,
        work_os_tool_names=frozenset({"wiki_get", "wiki_update"}),
    )
    timestamp = datetime(2026, 10, 8, tzinfo=UTC)

    manifest = build_run_manifest(
        settings,
        dataset(),
        discovery,
        repository_commit="abc123",
        timestamp=timestamp,
    )

    assert manifest.repository_commit == "abc123"
    assert manifest.server_runtime_version == "server-1"
    assert manifest.agent_protocol_version == "v1"
    assert manifest.mcp_protocol_version == "2026-07-28"
    assert manifest.tool_manifest_hash == "a" * 64
    assert manifest.dataset_id == "smoke"
    assert manifest.dataset_version == "1.2.3"
    assert manifest.evaluator_version == "0.1.0"
    assert manifest.persona_aliases == [
        "read-only-member",
        "read-write-member",
    ]
    assert manifest.random_seed == 13
    assert manifest.trial_count == 2
    assert manifest.timestamp == timestamp
    assert manifest.dependency_versions["langgraph-sdk"] == "0.4.6"
    assert manifest.dependency_versions["mcp"] == "2.3.0"


async def test_live_run_fails_closed_when_judge_is_configured_without_adapter() -> None:
    payload = settings_payload()
    payload.update(
        {
            "EVAL_JUDGE_PROVIDER": "fixture-provider",
            "EVAL_JUDGE_MODEL": "fixture-model",
            "EVAL_JUDGE_API_KEY": "judge-key-canary",
        }
    )
    settings = EvalSettings.model_validate(payload)

    with pytest.raises(ValueError, match="no reviewed judge adapter"):
        await run_live_dataset(settings, dataset())


async def test_live_run_rejects_dataset_id_mismatch_before_network() -> None:
    settings = EvalSettings.model_validate(settings_payload())
    wrong = dataset().model_copy(update={"id": "other"})

    with pytest.raises(ValueError, match="does not match EVAL_DATASET"):
        await run_live_dataset(settings, wrong)
