from __future__ import annotations

import ollama
import pytest
from deepeval.telemetry.client import NoopBackend, get_backend, set_backend
from deepeval.telemetry.events import Event
from deepeval.telemetry.properties import PropValue
from pydantic import SecretStr, ValidationError

from config.models import JudgeProvider, JudgeSettings
from config.settings import EvalSettings
from metrics.ollama_cloud_judge import (
    OLLAMA_CLOUD_BASE_URL,
    isolate_deepeval_from_hosted_services,
    ollama_cloud_judge_model,
)
from tests.test_settings import base_payload

JUDGE_KEY_CANARY = "ollama-cloud-judge-key-canary"


def judge_settings() -> JudgeSettings:
    return JudgeSettings(
        provider=JudgeProvider.OLLAMA_CLOUD,
        model="gpt-oss:120b",
        api_key=SecretStr(JUDGE_KEY_CANARY),
    )


class RecordingBackend:
    def __init__(self) -> None:
        self.events: list[Event] = []

    def capture(self, anonymous_id: str, event: Event, properties: dict[str, PropValue]) -> None:
        self.events.append(event)

    def flush(self) -> None:
        return None


def test_isolation_replaces_deepeval_telemetry_backend_with_noop() -> None:
    set_backend(RecordingBackend())

    isolate_deepeval_from_hosted_services()

    assert isinstance(get_backend(), NoopBackend)


def test_isolation_rejects_confident_ai_credentials(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("CONFIDENT_API_KEY", "confident-key-canary")

    with pytest.raises(RuntimeError, match="Confident AI"):
        isolate_deepeval_from_hosted_services()


def test_judge_model_targets_ollama_cloud_with_bearer_header(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    created: list[dict[str, object]] = []

    class RecordingClient:
        def __init__(self, **options: object) -> None:
            created.append(options)

    monkeypatch.setattr(ollama, "Client", RecordingClient)
    # DeepEvalBaseLLM 생성자가 load_model()로 client를 한 번 만든다.
    model = ollama_cloud_judge_model(judge_settings())

    assert created == [
        {
            "host": OLLAMA_CLOUD_BASE_URL,
            "headers": {"Authorization": f"Bearer {JUDGE_KEY_CANARY}"},
        }
    ]
    assert JUDGE_KEY_CANARY not in model.get_model_name()


def test_settings_accept_only_ollama_cloud_judge_provider() -> None:
    payload = base_payload()
    payload.update(
        {
            "EVAL_JUDGE_PROVIDER": "openai",
            "EVAL_JUDGE_MODEL": "judge-model",
            "EVAL_JUDGE_API_KEY": JUDGE_KEY_CANARY,
        }
    )

    with pytest.raises(ValidationError):
        EvalSettings.model_validate(payload)
