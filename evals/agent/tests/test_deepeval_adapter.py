from __future__ import annotations

import asyncio
from typing import Any, cast

from deepeval.metrics import ToolPermissionMetric

from datasets.schema import EvalCase
from metrics.deepeval_adapter import (
    run_bounded_shards,
    run_standalone_metric,
    shard,
    to_llm_test_case,
)
from runner.trajectory import ObservedToolCall, ObservedTrajectory


def test_llm_test_case_projection_uses_public_observations_only() -> None:
    case = EvalCase.model_validate(
        {
            "id": "tool-projection",
            "version": "1.0.0",
            "input": ["read ticket"],
            "persona": "member",
            "expected_tools": {"tools": ["get_ticket"]},
        }
    )
    trajectory = ObservedTrajectory(
        case_id=case.id,
        thread_id="thread-1",
        run_ids=["run-1"],
        final_response="done",
        tools_called=[
            ObservedToolCall(
                sequence=1,
                name="get_ticket",
                arguments={"id": "ticket-1"},
            )
        ],
    )

    projected = to_llm_test_case(case, trajectory)
    assert projected.tools_called
    assert projected.tools_called[0].name == "get_ticket"
    projected_any = cast(Any, projected)
    assert cast(dict[str, object], projected_any.metadata) == {
        "case_id": case.id,
        "trajectory_source": "public-black-box",
        "reconstructed": False,
    }


async def test_tool_permission_metric_is_supplemental_not_expected_tool_proof() -> None:
    case = EvalCase(
        id="no-tool",
        version="1.0.0",
        input=["do nothing"],
        persona="member",
    )
    trajectory = ObservedTrajectory(
        case_id=case.id,
        thread_id="thread-1",
        run_ids=["run-1"],
    )
    projected = to_llm_test_case(case, trajectory)
    metric = ToolPermissionMetric(denied_tools=["delete_ticket"])

    result = await run_standalone_metric(
        "ToolPermissionMetric",
        metric,
        projected,
        async_mode=False,
        timeout_seconds=5,
    )

    assert result.status == "passed"
    assert result.score == 1


async def test_bounded_shards_preserve_order() -> None:
    async def evaluate(value: int) -> int:
        await asyncio.sleep(0)
        return value * 2

    assert shard([1, 2, 3, 4, 5], 2) == [[1, 2], [3, 4], [5]]
    assert await run_bounded_shards(
        [1, 2, 3, 4, 5],
        evaluate,
        batch_size=2,
        timeout_seconds=2,
    ) == [2, 4, 6, 8, 10]
