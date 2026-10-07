from __future__ import annotations

import hashlib
from collections.abc import Mapping
from typing import Any, TypeGuard, cast

from datasets.schema import (
    EvalCase,
    FixtureDeclaration,
    OutcomeAssertion,
    OutcomeOperator,
)
from fixtures.lifecycle import FixtureLease
from personas.registry import canonical_persona_alias
from runner.trajectory import ObservedOutcome

_HELPER_KEYS = frozenset({"organizationAlias", "projectAlias", "columnName"})


def _fixture_id(owner: str, kind: str, alias: str) -> str:
    digest = hashlib.sha256(f"{owner}\x00{kind}\x00{alias}".encode()).hexdigest()[:16]
    return f"fixture-{kind}-{digest}"


def _is_json_object(value: object) -> TypeGuard[dict[str, Any]]:
    return isinstance(value, dict)


def _payload_for(
    owner: str,
    declaration: FixtureDeclaration,
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        key: value
        for key, value in declaration.values.items()
        if key not in _HELPER_KEYS and value is not None
    }
    payload.setdefault("id", _fixture_id(owner, declaration.kind, declaration.alias))
    return payload


def _set_path(payload: dict[str, Any], path: str, value: Any) -> None:
    segments = path.split(".")
    current: dict[str, Any] | list[Any] = payload

    for index, segment in enumerate(segments):
        last = index == len(segments) - 1
        next_is_index = not last and segments[index + 1].isdigit()

        if isinstance(current, dict):
            if last:
                current[segment] = value
                return
            child = current.get(segment)
            if next_is_index:
                if not isinstance(child, list):
                    child = []
                    current[segment] = child
            else:
                if not isinstance(child, dict):
                    child = {}
                    current[segment] = child
            current = cast(dict[str, Any] | list[Any], child)
            continue

        position = int(segment)
        while len(current) <= position:
            current.append(None)
        if last:
            current[position] = value
            return
        child = current[position]
        if next_is_index:
            if not isinstance(child, list):
                child = []
                current[position] = child
        else:
            if not isinstance(child, dict):
                child = {}
                current[position] = child
        current = cast(dict[str, Any] | list[Any], child)


def _delete_path(payload: dict[str, Any], path: str) -> None:
    segments = path.split(".")
    current: object = payload

    for segment in segments[:-1]:
        if _is_json_object(current):
            current = current.get(segment)
            if current is None:
                return
            continue
        if isinstance(current, list) and segment.isdigit():
            current_list = cast(list[Any], current)
            position = int(segment)
            if position >= len(current_list):
                return
            current = current_list[position]
            continue
        return

    leaf = segments[-1]
    if isinstance(current, dict):
        cast(dict[str, Any], current).pop(leaf, None)
    elif isinstance(current, list) and leaf.isdigit():
        current_list = cast(list[Any], current)
        position = int(leaf)
        if position < len(current_list):
            current_list[position] = None


def _outcome_value(assertion: OutcomeAssertion) -> object:
    if assertion.operator == OutcomeOperator.EQUALS:
        return assertion.value
    if assertion.operator == OutcomeOperator.NOT_EQUALS:
        candidate = "fixture-not-equal"
        return "fixture-not-equal-alt" if assertion.value == candidate else candidate
    if assertion.operator == OutcomeOperator.CONTAINS:
        if isinstance(assertion.value, str):
            return assertion.value
        if _is_json_object(assertion.value):
            return dict(assertion.value)
        return [assertion.value]
    if assertion.operator == OutcomeOperator.EXISTS:
        return "fixture-present"
    raise ValueError(f"operator has no materialized outcome value: {assertion.operator}")


class DeterministicFixtureProvider:
    """PR fast에서 dataset 계약을 재현하는 저장소 내부 deterministic fixture provider."""

    def __init__(self) -> None:
        self._outcomes: dict[str, dict[str, dict[str, Any]]] = {}

    async def setup(
        self,
        case: EvalCase,
        *,
        owner: str,
    ) -> FixtureLease:
        if owner in self._outcomes:
            raise ValueError(f"fixture owner already active: {owner}")

        outcomes: dict[str, dict[str, Any]] = {}
        public_ids: dict[str, str] = {}
        declarations = list(case.preconditions)

        if case.organization_fixture is not None and not any(
            item.kind == "organization" and item.alias == case.organization_fixture
            for item in declarations
        ):
            declarations.insert(
                0,
                FixtureDeclaration(
                    kind="organization",
                    alias=case.organization_fixture,
                    values={},
                ),
            )

        for declaration in declarations:
            source = f"{declaration.kind}:{declaration.alias}"
            if source in outcomes:
                raise ValueError(f"duplicate deterministic fixture source: {source}")
            payload = _payload_for(owner, declaration)
            outcomes[source] = payload
            public_ids[source] = str(payload["id"])

        persona = canonical_persona_alias(case.persona)
        public_ids[f"user:{case.persona}"] = _fixture_id(owner, "user", persona)
        if persona != case.persona:
            public_ids[f"user:{persona}"] = public_ids[f"user:{case.persona}"]

        self._outcomes[owner] = outcomes
        return FixtureLease(
            owner=owner,
            persona_alias=persona,
            organization_alias=case.organization_fixture,
            public_ids=public_ids,
        )

    def materialize_expected_outcomes(
        self,
        case: EvalCase,
        lease: FixtureLease,
    ) -> None:
        outcomes = self._outcomes.get(lease.owner)
        if outcomes is None:
            raise ValueError(f"fixture owner is not active: {lease.owner}")

        for assertion in case.outcome_assertions:
            kind, separator, alias = assertion.source.partition(":")
            payload = outcomes.setdefault(
                assertion.source,
                {
                    "id": _fixture_id(
                        lease.owner,
                        kind if separator else "outcome",
                        alias if separator else assertion.source,
                    )
                },
            )
            if assertion.operator == OutcomeOperator.NOT_EXISTS:
                _delete_path(payload, assertion.path)
                continue
            _set_path(payload, assertion.path, _outcome_value(assertion))

    async def observe(
        self,
        case: EvalCase,
        lease: FixtureLease,
    ) -> list[ObservedOutcome]:
        outcomes = self._outcomes.get(lease.owner)
        if outcomes is None:
            raise ValueError(f"fixture owner is not active: {lease.owner}")

        observed: list[ObservedOutcome] = []
        for source in dict.fromkeys(
            assertion.source for assertion in case.outcome_assertions
        ):
            payload = outcomes.get(source)
            if payload is None:
                raise ValueError(f"unknown deterministic outcome source: {source}")
            observed.append(
                ObservedOutcome(
                    source=source,
                    payload=dict(payload),
                )
            )
        return observed

    async def cleanup(
        self,
        case: EvalCase,
        lease: FixtureLease,
    ) -> None:
        del case
        self._outcomes.pop(lease.owner, None)

    def snapshot(self, owner: str) -> Mapping[str, Mapping[str, Any]]:
        outcomes = self._outcomes.get(owner)
        if outcomes is None:
            raise ValueError(f"fixture owner is not active: {owner}")
        return outcomes
