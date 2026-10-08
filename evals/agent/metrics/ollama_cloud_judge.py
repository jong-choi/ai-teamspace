from __future__ import annotations

from deepeval.confident.api import is_confident
from deepeval.metrics import ArgumentCorrectnessMetric
from deepeval.models import OllamaModel
from deepeval.telemetry.client import NoopBackend, set_backend

from config.models import JudgeProvider, JudgeSettings
from datasets.schema import EvalCase
from metrics.deepeval_adapter import run_standalone_metric, to_llm_test_case
from reports.schema import MetricResult
from runner.case_runner import Judge
from runner.trajectory import ObservedTrajectory

OLLAMA_CLOUD_BASE_URL = "https://ollama.com"
ARGUMENT_CORRECTNESS_THRESHOLD = 0.5


def isolate_deepeval_from_hosted_services() -> None:
    # DeepEval은 opt-out하지 않으면 PostHog로 telemetry를 보내고,
    # Confident AI key가 있으면 결과를 올릴 수 있다. judge 호출 외에는 평가 데이터가
    # 밖으로 나가지 않도록 telemetry backend를 끄고 Confident AI 연결을 거부한다.
    set_backend(NoopBackend())
    if is_confident():
        raise RuntimeError("Confident AI credentials must not be configured for local evals")


def ollama_cloud_judge_model(settings: JudgeSettings) -> OllamaModel:
    if settings.provider != JudgeProvider.OLLAMA_CLOUD:
        raise ValueError(f"unsupported judge provider: {settings.provider}")
    # DeepEval OllamaModel은 추가 인자를 ollama Client에 그대로 넘기므로
    # Ollama Cloud API key를 Authorization header로 전달한다.
    return OllamaModel(
        model=settings.model,
        base_url=OLLAMA_CLOUD_BASE_URL,
        temperature=0,
        headers={"Authorization": f"Bearer {settings.api_key.get_secret_value()}"},
    )


def create_ollama_cloud_judge(
    settings: JudgeSettings,
    *,
    async_mode: bool,
    timeout_seconds: float,
) -> Judge:
    isolate_deepeval_from_hosted_services()
    model = ollama_cloud_judge_model(settings)

    async def judge(case: EvalCase, trajectory: ObservedTrajectory) -> list[MetricResult]:
        metric = ArgumentCorrectnessMetric(
            threshold=ARGUMENT_CORRECTNESS_THRESHOLD,
            model=model,
            include_reason=True,
            async_mode=async_mode,
        )
        return [
            await run_standalone_metric(
                "ArgumentCorrectnessMetric",
                metric,
                to_llm_test_case(case, trajectory),
                async_mode=async_mode,
                timeout_seconds=timeout_seconds,
            )
        ]

    return judge
