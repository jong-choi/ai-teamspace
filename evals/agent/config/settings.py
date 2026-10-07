from __future__ import annotations

from pathlib import Path
from typing import Any, Literal
from urllib.parse import urlsplit

from pydantic import Field, SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

from config.models import (
    DeepEvalAsyncMode,
    EvalTargetAdapter,
    EvalTier,
    HarnessLimits,
    JudgeSettings,
    LangfuseLookupSettings,
    SafeSettingsManifest,
)

REPO_ROOT = Path(__file__).resolve().parents[3]
TEMP_ROOT = (REPO_ROOT / ".temp").resolve()


def _blank_to_none(value: Any) -> Any:
    if isinstance(value, str) and not value.strip():
        return None
    return value


def _validate_http_url(name: str, value: str) -> str:
    parsed = urlsplit(value)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise ValueError(f"{name} must be an absolute http(s) URL")
    if parsed.username or parsed.password:
        raise ValueError(f"{name} must not contain URL credentials")
    if parsed.query or parsed.fragment:
        raise ValueError(f"{name} must not contain query or fragment")
    return value.rstrip("/")


def _validate_origin(name: str, value: str) -> str:
    validated = _validate_http_url(name, value)
    if urlsplit(validated).path not in {"", "/"}:
        raise ValueError(f"{name} must not contain a path")
    return validated


def _effective_port(value: str) -> int:
    parsed = urlsplit(value)
    if parsed.port is not None:
        return parsed.port
    return 443 if parsed.scheme == "https" else 80


def _is_loopback_host(value: str) -> bool:
    hostname = urlsplit(value).hostname
    return hostname in {"localhost", "127.0.0.1", "::1"}


def _same_target_origin(left: str, right: str) -> bool:
    left_parsed = urlsplit(left)
    right_parsed = urlsplit(right)
    if left_parsed.scheme != right_parsed.scheme:
        return False
    if _effective_port(left) != _effective_port(right):
        return False
    if _is_loopback_host(left) and _is_loopback_host(right):
        return True
    return left_parsed.hostname == right_parsed.hostname


class EvalSettings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=True,
        frozen=True,
    )

    server_url: str = Field(alias="EVAL_SERVER_URL")
    mcp_resource_url: str = Field(alias="EVAL_MCP_RESOURCE_URL")
    trusted_origin: str = Field(alias="EVAL_TRUSTED_ORIGIN")
    ephemeral_target_origin: str | None = Field(
        default=None,
        alias="EVAL_EPHEMERAL_TARGET_ORIGIN",
    )
    target_environment: Literal["ephemeral"] = Field(alias="EVAL_TARGET_ENVIRONMENT")
    target_adapter: EvalTargetAdapter = Field(
        default=EvalTargetAdapter.PUBLIC_HTTP,
        alias="EVAL_TARGET_ADAPTER",
    )
    run_namespace: str = Field(min_length=3, max_length=120, alias="EVAL_RUN_NAMESPACE")

    dataset: str = Field(min_length=1, max_length=120, alias="EVAL_DATASET")
    baseline: str = Field(min_length=1, max_length=120, alias="EVAL_BASELINE")
    output_dir: Path = Field(alias="EVAL_OUTPUT_DIR")
    tier: EvalTier = Field(default=EvalTier.PR, alias="EVAL_TIER")

    max_concurrency: int = Field(default=4, ge=1, le=32, alias="EVAL_MAX_CONCURRENCY")
    case_timeout_seconds: int = Field(
        default=120,
        ge=1,
        le=900,
        alias="EVAL_CASE_TIMEOUT_SECONDS",
    )
    max_turns: int = Field(default=12, ge=1, le=100, alias="EVAL_MAX_TURNS")
    max_tool_calls: int = Field(default=20, ge=0, le=200, alias="EVAL_MAX_TOOL_CALLS")
    max_subagents: int = Field(default=4, ge=0, le=32, alias="EVAL_MAX_SUBAGENTS")
    max_cost: float = Field(default=5, ge=0, le=1_000, alias="EVAL_MAX_COST")
    deepeval_batch_size: int = Field(
        default=8,
        ge=1,
        le=64,
        alias="EVAL_DEEPEVAL_BATCH_SIZE",
    )
    deepeval_async_mode: DeepEvalAsyncMode = Field(
        default=DeepEvalAsyncMode.SYNC,
        alias="EVAL_DEEPEVAL_ASYNC_MODE",
    )
    trials: int = Field(default=1, ge=1, le=50, alias="EVAL_TRIALS")
    random_seed: int = Field(
        default=1,
        ge=0,
        le=2_147_483_647,
        alias="EVAL_RANDOM_SEED",
    )

    auth_bearer_token: SecretStr | None = Field(
        default=None,
        alias="EVAL_AUTH_BEARER_TOKEN",
    )
    judge_provider: str | None = Field(default=None, alias="EVAL_JUDGE_PROVIDER")
    judge_model: str | None = Field(default=None, alias="EVAL_JUDGE_MODEL")
    judge_api_key: SecretStr | None = Field(
        default=None,
        alias="EVAL_JUDGE_API_KEY",
    )

    langfuse_enabled: bool = Field(default=False, alias="EVAL_LANGFUSE_ENABLED")
    langfuse_base_url: str | None = Field(
        default=None,
        alias="EVAL_LANGFUSE_BASE_URL",
    )
    langfuse_public_key: str | None = Field(
        default=None,
        alias="EVAL_LANGFUSE_PUBLIC_KEY",
    )
    langfuse_secret_key: SecretStr | None = Field(
        default=None,
        alias="EVAL_LANGFUSE_SECRET_KEY",
    )
    langfuse_project_alias: str | None = Field(
        default=None,
        alias="EVAL_LANGFUSE_PROJECT_ALIAS",
    )
    langfuse_ui_trace_url_template: str | None = Field(
        default=None,
        alias="EVAL_LANGFUSE_UI_TRACE_URL_TEMPLATE",
    )

    @field_validator(
        "auth_bearer_token",
        "ephemeral_target_origin",
        "judge_provider",
        "judge_model",
        "judge_api_key",
        "langfuse_base_url",
        "langfuse_public_key",
        "langfuse_secret_key",
        "langfuse_project_alias",
        "langfuse_ui_trace_url_template",
        mode="before",
    )
    @classmethod
    def normalize_optional_blanks(cls, value: Any) -> Any:
        return _blank_to_none(value)

    @field_validator("server_url")
    @classmethod
    def validate_server_url(cls, value: str) -> str:
        return _validate_http_url("EVAL_SERVER_URL", value)

    @field_validator("mcp_resource_url")
    @classmethod
    def validate_mcp_resource_url(cls, value: str) -> str:
        validated = _validate_http_url("EVAL_MCP_RESOURCE_URL", value)
        if urlsplit(validated).path in {"", "/"}:
            raise ValueError("EVAL_MCP_RESOURCE_URL must include the MCP resource path")
        return validated

    @field_validator("trusted_origin")
    @classmethod
    def validate_trusted_origin(cls, value: str) -> str:
        return _validate_origin("EVAL_TRUSTED_ORIGIN", value)

    @field_validator("ephemeral_target_origin")
    @classmethod
    def validate_ephemeral_target_origin(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return _validate_origin("EVAL_EPHEMERAL_TARGET_ORIGIN", value)

    @field_validator("langfuse_base_url")
    @classmethod
    def validate_langfuse_base_url(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return _validate_http_url("EVAL_LANGFUSE_BASE_URL", value)

    @field_validator("output_dir", mode="before")
    @classmethod
    def normalize_output_dir(cls, value: Any) -> Path:
        path = Path(str(value)).expanduser()
        if not path.is_absolute():
            path = REPO_ROOT / path
        return path.resolve()

    @model_validator(mode="after")
    def validate_isolation_and_secrets(self) -> EvalSettings:
        output = self.output_dir
        if output == REPO_ROOT or REPO_ROOT in output.parents:
            if output != TEMP_ROOT and TEMP_ROOT not in output.parents:
                raise ValueError(
                    "EVAL_OUTPUT_DIR inside the repository must be under repo/.temp"
                )

        if not _same_target_origin(self.server_url, self.mcp_resource_url):
            raise ValueError(
                "EVAL_SERVER_URL and EVAL_MCP_RESOURCE_URL must use the same target origin"
            )
        if not _same_target_origin(self.server_url, self.trusted_origin):
            raise ValueError(
                "EVAL_TRUSTED_ORIGIN must match the eval server target origin"
            )

        confirmation = self.ephemeral_target_origin
        if _is_loopback_host(self.server_url):
            if confirmation is not None and not _same_target_origin(
                self.server_url,
                confirmation,
            ):
                raise ValueError(
                    "EVAL_EPHEMERAL_TARGET_ORIGIN does not match the loopback eval target"
                )
        else:
            if confirmation is None:
                raise ValueError(
                    "remote eval targets require EVAL_EPHEMERAL_TARGET_ORIGIN"
                )
            if not _same_target_origin(self.server_url, confirmation):
                raise ValueError(
                    "EVAL_EPHEMERAL_TARGET_ORIGIN must exactly confirm the remote eval origin"
                )

        judge_values = [self.judge_provider, self.judge_model, self.judge_api_key]
        if any(value is not None for value in judge_values) and not all(
            value is not None for value in judge_values
        ):
            raise ValueError(
                "judge configuration requires EVAL_JUDGE_PROVIDER, "
                "EVAL_JUDGE_MODEL, and EVAL_JUDGE_API_KEY together"
            )

        LangfuseLookupSettings(
            enabled=self.langfuse_enabled,
            base_url=self.langfuse_base_url,
            public_key=self.langfuse_public_key,
            secret_key=self.langfuse_secret_key,
            project_alias=self.langfuse_project_alias,
            ui_trace_url_template=self.langfuse_ui_trace_url_template,
        )
        return self

    def limits(self) -> HarnessLimits:
        return HarnessLimits(
            max_concurrency=self.max_concurrency,
            case_timeout_seconds=self.case_timeout_seconds,
            max_turns=self.max_turns,
            max_tool_calls=self.max_tool_calls,
            max_subagents=self.max_subagents,
            max_cost=self.max_cost,
            deepeval_batch_size=self.deepeval_batch_size,
            deepeval_async_mode=self.deepeval_async_mode,
            trials=self.trials,
            random_seed=self.random_seed,
        )

    def judge(self) -> JudgeSettings | None:
        if self.judge_provider is None:
            return None
        assert self.judge_model is not None
        assert self.judge_api_key is not None
        return JudgeSettings(
            provider=self.judge_provider,
            model=self.judge_model,
            api_key=self.judge_api_key,
        )

    def langfuse(self) -> LangfuseLookupSettings:
        return LangfuseLookupSettings(
            enabled=self.langfuse_enabled,
            base_url=self.langfuse_base_url,
            public_key=self.langfuse_public_key,
            secret_key=self.langfuse_secret_key,
            project_alias=self.langfuse_project_alias,
            ui_trace_url_template=self.langfuse_ui_trace_url_template,
        )

    def safe_manifest(self) -> SafeSettingsManifest:
        return SafeSettingsManifest(
            server_url=self.server_url,
            mcp_resource_url=self.mcp_resource_url,
            trusted_origin=self.trusted_origin,
            ephemeral_target_origin=self.ephemeral_target_origin,
            target_environment=self.target_environment,
            target_adapter=self.target_adapter,
            run_namespace=self.run_namespace,
            dataset=self.dataset,
            baseline=self.baseline,
            output_dir=self.output_dir,
            limits=self.limits(),
            tier=self.tier,
            judge_provider=self.judge_provider,
            judge_model=self.judge_model,
            langfuse_enabled=self.langfuse_enabled,
            langfuse_project_alias=self.langfuse_project_alias,
        )


def load_settings() -> EvalSettings:
    # BaseSettings intentionally receives required values from env/.env at runtime.
    return EvalSettings()  # pyright: ignore[reportCallIssue]
