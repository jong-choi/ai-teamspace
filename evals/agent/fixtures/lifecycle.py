from __future__ import annotations

from collections.abc import Mapping
from typing import Protocol, cast

from pydantic import BaseModel, ConfigDict, Field

from datasets.schema import EvalCase
from runner.trajectory import ObservedOutcome


class FixtureLease(BaseModel):
    model_config = ConfigDict(frozen=True)

    owner: str = Field(min_length=1, max_length=240)
    persona_alias: str = Field(min_length=1, max_length=120)
    organization_alias: str | None = Field(default=None, max_length=120)
    public_ids: dict[str, str] = Field(default_factory=dict[str, str], max_length=128)


class FixtureProvider(Protocol):
    async def setup(
        self,
        case: EvalCase,
        *,
        owner: str,
    ) -> FixtureLease: ...

    async def observe(
        self,
        case: EvalCase,
        lease: FixtureLease,
    ) -> list[ObservedOutcome]: ...

    async def cleanup(
        self,
        case: EvalCase,
        lease: FixtureLease,
    ) -> None: ...


def resolve_fixture_reference(value: object, public_ids: Mapping[str, str]) -> object:
    """Replace a `$<kind>:<alias>` string with that fixture's public id.

    Ids are created per trial, so a dataset can only name them by fixture alias.
    """

    if isinstance(value, list):
        return [
            resolve_fixture_reference(item, public_ids)
            for item in cast(list[object], value)
        ]
    if not isinstance(value, str) or not value.startswith("$"):
        return value
    reference = value[1:]
    public_id = public_ids.get(reference)
    if public_id is None:
        raise ValueError(f"unknown fixture reference: {reference!r}")
    return public_id


def fixture_owner(run_namespace: str, case_id: str, trial: int) -> str:
    return f"{run_namespace}:{case_id}:trial-{trial}"
