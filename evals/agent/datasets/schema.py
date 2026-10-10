from __future__ import annotations

import json
from enum import StrEnum
from pathlib import Path
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, model_validator


class ToolExpectationMode(StrEnum):
    EXACT = "exact"
    ANY_OF = "any_of"
    ORDERED = "ordered"


class ArgumentOperator(StrEnum):
    EXACT = "exact"
    CONTAINS = "contains"
    PRESENT = "present"
    ABSENT = "absent"
    ONE_OF = "one_of"


class OutcomeOperator(StrEnum):
    EQUALS = "equals"
    NOT_EQUALS = "not_equals"
    CONTAINS = "contains"
    EXISTS = "exists"
    NOT_EXISTS = "not_exists"


class CleanupPolicy(StrEnum):
    EPHEMERAL_RUN = "ephemeral_run"
    NONE = "none"


class ExecutionExpectation(StrEnum):
    SUCCESS = "success"
    AUTH_DENIED = "auth_denied"


class ToolExpectation(BaseModel):
    model_config = ConfigDict(frozen=True)

    mode: ToolExpectationMode = ToolExpectationMode.EXACT
    tools: list[str] = Field(min_length=1, max_length=32)

    @model_validator(mode="after")
    def unique_tools(self) -> ToolExpectation:
        if len(set(self.tools)) != len(self.tools):
            raise ValueError("expected tool names must be unique")
        return self


class ArgumentAssertion(BaseModel):
    model_config = ConfigDict(frozen=True)

    tool: str = Field(min_length=1, max_length=160)
    path: str = Field(min_length=1, max_length=240)
    operator: ArgumentOperator
    value: Any = None

    @model_validator(mode="after")
    def validate_value_contract(self) -> ArgumentAssertion:
        if self.operator not in {ArgumentOperator.PRESENT, ArgumentOperator.ABSENT}:
            if self.value is None:
                raise ValueError(f"{self.operator} requires a value")
        return self


class OutcomeAssertion(BaseModel):
    model_config = ConfigDict(frozen=True)

    source: str = Field(min_length=1, max_length=120)
    path: str = Field(min_length=1, max_length=240)
    operator: OutcomeOperator
    value: Any = None
    critical: bool = True

    @model_validator(mode="after")
    def validate_value_contract(self) -> OutcomeAssertion:
        if self.operator not in {OutcomeOperator.EXISTS, OutcomeOperator.NOT_EXISTS}:
            if self.value is None:
                raise ValueError(f"{self.operator} requires a value")
        return self


class InterruptExpectation(BaseModel):
    model_config = ConfigDict(frozen=True)

    decision: str = Field(pattern=r"^(approve|reject|edit)$")
    before_tool: str | None = Field(default=None, max_length=160)
    edited_arguments: dict[str, str | int | float | bool | None] | None = Field(
        default=None,
        max_length=64,
    )

    @model_validator(mode="after")
    def validate_edit_contract(self) -> InterruptExpectation:
        if self.decision == "edit":
            if self.before_tool is None:
                raise ValueError("edit decision requires before_tool")
            if self.edited_arguments is None:
                raise ValueError("edit decision requires edited_arguments")
        elif self.edited_arguments is not None:
            raise ValueError("edited_arguments is only valid for edit decisions")
        return self


class FixtureDeclaration(BaseModel):
    model_config = ConfigDict(frozen=True)

    kind: str = Field(min_length=1, max_length=80)
    alias: str = Field(min_length=1, max_length=120)
    values: dict[str, str | int | float | bool | None] = Field(
        default_factory=dict,
        max_length=32,
    )


class ClientContext(BaseModel):
    """Screen context a product client sends as `configurable.client_context`.

    A param value written as `$<kind>:<alias>` is replaced with that fixture's public id.
    """

    model_config = ConfigDict(frozen=True)

    time_zone: str | None = Field(default=None, min_length=1, max_length=64)
    route: str | None = Field(default=None, min_length=1, max_length=200)
    params: dict[str, str] = Field(default_factory=dict[str, str], max_length=12)


class CaseBudget(BaseModel):
    model_config = ConfigDict(frozen=True)

    max_turns: int | None = Field(default=None, ge=1, le=100)
    max_tool_calls: int | None = Field(default=None, ge=0, le=200)
    max_subagents: int | None = Field(default=None, ge=0, le=32)
    timeout_seconds: int | None = Field(default=None, ge=1, le=900)
    max_cost: float | None = Field(default=None, ge=0, le=1_000)


class EvalCase(BaseModel):
    model_config = ConfigDict(frozen=True)

    id: str = Field(pattern=r"^[a-z0-9][a-z0-9._-]{0,127}$")
    version: str = Field(pattern=r"^\d+\.\d+\.\d+$")
    tags: list[str] = Field(default_factory=list, max_length=24)
    input: list[str] = Field(min_length=1, max_length=32)
    persona: str = Field(min_length=1, max_length=120)
    expected_execution: ExecutionExpectation = ExecutionExpectation.SUCCESS
    organization_fixture: str | None = Field(default=None, max_length=120)
    client_context: ClientContext | None = None
    preconditions: list[FixtureDeclaration] = Field(
        default_factory=list[FixtureDeclaration],
        max_length=32,
    )
    expected_tools: ToolExpectation | None = None
    forbidden_tools: list[str] = Field(default_factory=list, max_length=64)
    argument_assertions: list[ArgumentAssertion] = Field(
        default_factory=list[ArgumentAssertion],
        max_length=128,
    )
    expected_interrupts: list[InterruptExpectation] = Field(
        default_factory=list[InterruptExpectation],
        max_length=16,
    )
    outcome_assertions: list[OutcomeAssertion] = Field(
        default_factory=list[OutcomeAssertion],
        max_length=128,
    )
    answer_rubric: list[str] = Field(default_factory=list, max_length=32)
    budget: CaseBudget = Field(default_factory=CaseBudget)
    cleanup: CleanupPolicy = CleanupPolicy.EPHEMERAL_RUN

    @model_validator(mode="after")
    def validate_case_contract(self) -> EvalCase:
        if len(set(self.tags)) != len(self.tags):
            raise ValueError("case tags must be unique")
        if len(set(self.forbidden_tools)) != len(self.forbidden_tools):
            raise ValueError("forbidden tool names must be unique")
        if self.expected_tools:
            overlap = set(self.expected_tools.tools) & set(self.forbidden_tools)
            if overlap:
                raise ValueError(
                    "tools cannot be both expected and forbidden: "
                    + ", ".join(sorted(overlap))
                )
        if any(len(turn) > 16_000 for turn in self.input):
            raise ValueError("case input turn exceeds 16000 characters")
        if self.expected_execution == ExecutionExpectation.AUTH_DENIED:
            if "security" not in self.tags:
                raise ValueError("auth_denied execution requires the security tag")
            if self.expected_tools is not None:
                raise ValueError("auth_denied execution cannot require expected tools")
            if self.argument_assertions:
                raise ValueError("auth_denied execution cannot assert tool arguments")
            if self.expected_interrupts:
                raise ValueError("auth_denied execution cannot require HITL decisions")
            if self.answer_rubric:
                raise ValueError("auth_denied execution cannot require an answer rubric")
        return self


class EvalDataset(BaseModel):
    model_config = ConfigDict(frozen=True)

    id: str = Field(pattern=r"^[a-z0-9][a-z0-9._-]{0,127}$")
    version: str = Field(pattern=r"^\d+\.\d+\.\d+$")
    cases: list[EvalCase] = Field(min_length=1, max_length=2_000)

    @model_validator(mode="after")
    def unique_case_ids(self) -> EvalDataset:
        ids = [case.id for case in self.cases]
        if len(set(ids)) != len(ids):
            raise ValueError("dataset case ids must be unique")
        return self


def load_dataset(path: Path) -> EvalDataset:
    if path.suffix.lower() != ".json":
        raise ValueError("v1 datasets must be JSON")
    raw = json.loads(path.read_text(encoding="utf-8"))
    return EvalDataset.model_validate(raw)
