from __future__ import annotations

from typing import Protocol

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


def fixture_owner(run_namespace: str, case_id: str, trial: int) -> str:
    return f"{run_namespace}:{case_id}:trial-{trial}"
