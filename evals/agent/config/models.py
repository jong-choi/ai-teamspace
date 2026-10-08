from __future__ import annotations

from enum import StrEnum
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, SecretStr, model_validator


class EvalTier(StrEnum):
    PR = "pr"
    NIGHTLY = "nightly"
    RELEASE = "release"


class DeepEvalAsyncMode(StrEnum):
    SYNC = "sync"
    ASYNC = "async"


class EvalTargetAdapter(StrEnum):
    PUBLIC_HTTP = "public-http"
    DETERMINISTIC_FIXTURE = "deterministic-fixture"


class JudgeProvider(StrEnum):
    OLLAMA_CLOUD = "ollama-cloud"


class JudgeSettings(BaseModel):
    model_config = ConfigDict(frozen=True)

    provider: JudgeProvider
    model: str
    api_key: SecretStr


class LangfuseLookupSettings(BaseModel):
    model_config = ConfigDict(frozen=True)

    enabled: bool = False
    base_url: str | None = None
    public_key: str | None = None
    secret_key: SecretStr | None = None
    project_alias: str | None = None
    ui_trace_url_template: str | None = None
    # Langfuse ingest는 비동기라 run 직후에는 trace가 아직 보이지 않을 수 있다.
    ingestion_wait_seconds: float = Field(default=30, ge=0, le=300)

    @model_validator(mode="after")
    def validate_enabled_configuration(self) -> LangfuseLookupSettings:
        if not self.enabled:
            return self
        required = {
            "base_url": self.base_url,
            "public_key": self.public_key,
            "secret_key": self.secret_key,
            "project_alias": self.project_alias,
        }
        missing = [name for name, value in required.items() if value is None]
        if missing:
            raise ValueError(
                "Langfuse linkage requires: " + ", ".join(sorted(missing))
            )
        if self.ui_trace_url_template and "{trace_id}" not in self.ui_trace_url_template:
            raise ValueError(
                "EVAL_LANGFUSE_UI_TRACE_URL_TEMPLATE must include {trace_id}"
            )
        return self


class HarnessLimits(BaseModel):
    model_config = ConfigDict(frozen=True)

    max_concurrency: int = Field(ge=1, le=32)
    case_timeout_seconds: int = Field(ge=1, le=900)
    max_turns: int = Field(ge=1, le=100)
    max_tool_calls: int = Field(ge=0, le=200)
    max_subagents: int = Field(ge=0, le=32)
    max_cost: float = Field(ge=0, le=1_000)
    deepeval_batch_size: int = Field(ge=1, le=64)
    deepeval_async_mode: DeepEvalAsyncMode
    trials: int = Field(ge=1, le=50)
    random_seed: int = Field(ge=0, le=2_147_483_647)


class SafeSettingsManifest(BaseModel):
    model_config = ConfigDict(frozen=True)

    server_url: str
    mcp_resource_url: str
    trusted_origin: str
    ephemeral_target_origin: str | None = None
    target_environment: Literal["ephemeral"]
    target_adapter: EvalTargetAdapter
    run_namespace: str
    dataset: str
    baseline: str
    output_dir: Path
    limits: HarnessLimits
    tier: EvalTier
    judge_provider: str | None = None
    judge_model: str | None = None
    langfuse_enabled: bool
    langfuse_project_alias: str | None = None
