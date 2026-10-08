from __future__ import annotations

from pathlib import Path

import pytest

from config.models import DeepEvalAsyncMode, JudgeSettings
from config.settings import EvalSettings
from datasets.schema import EvalCase, ToolExpectation
from metrics.ollama_cloud_judge import create_ollama_cloud_judge
from runner.trajectory import ObservedToolCall, ObservedTrajectory

pytestmark = pytest.mark.live_judge

ENV_PATH = Path(__file__).resolve().parents[1] / ".env"
REQUEST = "Search the team wiki for pages about the quarterly roadmap."


def configured_judge() -> tuple[EvalSettings, JudgeSettings]:
    if not ENV_PATH.is_file():
        pytest.skip("evals/agent/.env is not configured")
    settings = EvalSettings(_env_file=ENV_PATH)  # pyright: ignore[reportCallIssue]
    judge = settings.judge()
    if judge is None:
        pytest.skip("EVAL_JUDGE_* is not configured")
    return settings, judge


def fixture_case() -> EvalCase:
    return EvalCase(
        id="judge-fixture-wiki-search",
        version="1.0.0",
        input=[REQUEST],
        persona="member",
        expected_tools=ToolExpectation(tools=["wiki_search"]),
    )


def trajectory_with_query(query: str) -> ObservedTrajectory:
    return ObservedTrajectory(
        case_id="judge-fixture-wiki-search",
        thread_id="thread-judge-fixture",
        run_ids=["run-judge-fixture"],
        final_response="Here are the wiki pages I found.",
        tools_called=[
            ObservedToolCall(sequence=1, name="wiki_search", arguments={"query": query})
        ],
    )


@pytest.mark.parametrize(
    ("query", "expected_status"),
    [
        ("quarterly roadmap", "passed"),
        ("holiday party photos", "failed"),
    ],
)
async def test_argument_correctness_judge_separates_fixture_trajectories(
    query: str,
    expected_status: str,
) -> None:
    settings, judge_settings = configured_judge()
    judge = create_ollama_cloud_judge(
        judge_settings,
        async_mode=settings.deepeval_async_mode == DeepEvalAsyncMode.ASYNC,
        timeout_seconds=settings.case_timeout_seconds,
    )

    [result] = await judge(fixture_case(), trajectory_with_query(query))

    assert result.name == "ArgumentCorrectnessMetric"
    assert result.status == expected_status, result.reason
    assert judge_settings.api_key.get_secret_value() not in (result.reason or "")
