from __future__ import annotations

from pathlib import Path

import pytest
from pydantic import ValidationError

from datasets.schema import EvalCase, load_dataset
from metrics.eligibility import MetricSupport, metric_eligibility
from personas.registry import persona_recipe
from runner.manifest import canonicalize_tool_manifest, tool_manifest_hash


def test_tracked_smoke_dataset_loads() -> None:
    dataset = load_dataset(Path("datasets/smoke/smoke.json"))
    assert dataset.id == "smoke"
    assert [case.id for case in dataset.cases] == ["schema-smoke"]


def test_tracked_security_dataset_loads() -> None:
    dataset = load_dataset(Path("datasets/security/security.json"))
    assert dataset.id == "security"
    assert len(dataset.cases) == 4
    assert dataset.cases[0].expected_execution.value == "auth_denied"
    assert all("security" in case.tags for case in dataset.cases)


@pytest.mark.parametrize(
    "path",
    sorted(Path("datasets").glob("*/*.json")),
    ids=lambda path: path.stem,
)
def test_tracked_target_membership_personas_declare_an_organization_fixture(
    path: Path,
) -> None:
    # public-http fixture provider는 대상 조직 membership persona에
    # organization_fixture가 없으면 setup에서 실패한다. deterministic-fixture는
    # 이 조건을 보지 않으므로 tracked dataset에서 막는다.
    dataset = load_dataset(path)
    missing = [
        case.id
        for case in dataset.cases
        if persona_recipe(case.persona).membership == "target"
        and case.organization_fixture is None
    ]
    assert missing == []


def test_expected_and_forbidden_tool_overlap_is_invalid() -> None:
    with pytest.raises(ValidationError, match="both expected and forbidden"):
        EvalCase.model_validate(
            {
                "id": "invalid-overlap",
                "version": "1.0.0",
                "input": ["test"],
                "persona": "member",
                "expected_tools": {"tools": ["delete_ticket"]},
                "forbidden_tools": ["delete_ticket"],
            }
        )


def test_auth_denied_execution_contract_is_bounded_to_security_cases() -> None:
    with pytest.raises(ValidationError, match="requires the security tag"):
        EvalCase.model_validate(
            {
                "id": "invalid-auth-denial",
                "version": "1.0.0",
                "input": ["attempt access"],
                "persona": "expired-invalid-credential",
                "expected_execution": "auth_denied",
            }
        )

    with pytest.raises(ValidationError, match="cannot require expected tools"):
        EvalCase.model_validate(
            {
                "id": "invalid-auth-tools",
                "version": "1.0.0",
                "tags": ["security"],
                "input": ["attempt access"],
                "persona": "expired-invalid-credential",
                "expected_execution": "auth_denied",
                "expected_tools": {"tools": ["wiki_get"]},
            }
        )


def test_trace_only_and_plan_metrics_fail_closed() -> None:
    native = metric_eligibility("TaskCompletionMetric")
    assert native.support == MetricSupport.UNSUPPORTED

    reconstructed = metric_eligibility(
        "TaskCompletionMetric",
        reconstructed_trace=True,
    )
    assert reconstructed.support == MetricSupport.RECONSTRUCTED_TRACE

    plan = metric_eligibility(
        "PlanQualityMetric",
        reconstructed_trace=True,
        public_plan_observable=False,
    )
    assert plan.support == MetricSupport.UNSUPPORTED


def test_manifest_hash_is_order_independent_and_whitelisted() -> None:
    first = [
        {
            "name": "b",
            "description": "B",
            "inputSchema": {"type": "object", "properties": {"x": {"type": "string"}}},
            "secret": "do-not-hash",
        },
        {"name": "a", "description": "A", "inputSchema": {"type": "object"}},
    ]
    second = list(reversed(first))

    assert tool_manifest_hash(first) == tool_manifest_hash(second)
    canonical = canonicalize_tool_manifest(first)
    assert [tool["name"] for tool in canonical] == ["a", "b"]
    assert "secret" not in canonical[1]
