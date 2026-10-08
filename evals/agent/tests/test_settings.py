from __future__ import annotations

import pytest
from pydantic import ValidationError

from config.settings import REPO_ROOT, EvalSettings


def base_payload() -> dict[str, object]:
    return {
        "EVAL_SERVER_URL": "http://127.0.0.1:3100",
        "EVAL_MCP_RESOURCE_URL": "http://127.0.0.1:3100/mcp",
        "EVAL_TRUSTED_ORIGIN": "http://localhost:3100",
        "EVAL_TARGET_ENVIRONMENT": "ephemeral",
        "EVAL_RUN_NAMESPACE": "unit-test",
        "EVAL_DATASET": "smoke",
        "EVAL_BASELINE": "smoke-v1",
        "EVAL_OUTPUT_DIR": ".temp/evals/agent/unit",
    }


def test_settings_fail_closed_for_non_ephemeral_target() -> None:
    payload = base_payload()
    payload["EVAL_TARGET_ENVIRONMENT"] = "production"
    with pytest.raises(ValidationError):
        EvalSettings.model_validate(payload)


def test_settings_reject_tracked_output_path() -> None:
    payload = base_payload()
    payload["EVAL_OUTPUT_DIR"] = "evals/agent/generated"
    with pytest.raises(ValidationError, match="repo/.temp"):
        EvalSettings.model_validate(payload)


def test_safe_manifest_contains_no_secret() -> None:
    payload = base_payload()
    payload.update(
        {
            "EVAL_AUTH_BEARER_TOKEN": "access-token-canary",
            "EVAL_JUDGE_PROVIDER": "ollama-cloud",
            "EVAL_JUDGE_MODEL": "judge-1",
            "EVAL_JUDGE_API_KEY": "judge-secret-canary",
        }
    )
    settings = EvalSettings.model_validate(payload)
    serialized = settings.safe_manifest().model_dump_json()

    assert "access-token-canary" not in serialized
    assert "judge-secret-canary" not in serialized
    assert settings.output_dir == (REPO_ROOT / ".temp/evals/agent/unit").resolve()


def test_mcp_resource_requires_path() -> None:
    payload = base_payload()
    payload["EVAL_MCP_RESOURCE_URL"] = "http://127.0.0.1:3100"
    with pytest.raises(ValidationError, match="MCP resource path"):
        EvalSettings.model_validate(payload)


def test_trusted_origin_is_required_and_must_not_have_a_path() -> None:
    missing = base_payload()
    missing.pop("EVAL_TRUSTED_ORIGIN")
    with pytest.raises(ValidationError):
        EvalSettings.model_validate(missing)

    with_path = base_payload()
    with_path["EVAL_TRUSTED_ORIGIN"] = "http://localhost:3100/app"
    with pytest.raises(ValidationError, match="must not contain a path"):
        EvalSettings.model_validate(with_path)


def test_target_urls_must_share_one_origin() -> None:
    payload = base_payload()
    payload["EVAL_MCP_RESOURCE_URL"] = "http://127.0.0.1:3200/mcp"
    with pytest.raises(ValidationError, match="same target origin"):
        EvalSettings.model_validate(payload)

    payload = base_payload()
    payload["EVAL_TRUSTED_ORIGIN"] = "http://127.0.0.1:3200"
    with pytest.raises(ValidationError, match="must match the eval server"):
        EvalSettings.model_validate(payload)


def test_remote_target_requires_exact_ephemeral_origin_confirmation() -> None:
    payload = base_payload()
    payload.update(
        {
            "EVAL_SERVER_URL": "https://eval.example.test",
            "EVAL_MCP_RESOURCE_URL": "https://eval.example.test/mcp",
            "EVAL_TRUSTED_ORIGIN": "https://eval.example.test",
        }
    )
    with pytest.raises(ValidationError, match="require EVAL_EPHEMERAL_TARGET_ORIGIN"):
        EvalSettings.model_validate(payload)

    payload["EVAL_EPHEMERAL_TARGET_ORIGIN"] = "https://other.example.test"
    with pytest.raises(ValidationError, match="must exactly confirm"):
        EvalSettings.model_validate(payload)

    payload["EVAL_EPHEMERAL_TARGET_ORIGIN"] = "https://eval.example.test"
    settings = EvalSettings.model_validate(payload)
    assert settings.ephemeral_target_origin == "https://eval.example.test"
    assert (
        settings.safe_manifest().ephemeral_target_origin
        == "https://eval.example.test"
    )
