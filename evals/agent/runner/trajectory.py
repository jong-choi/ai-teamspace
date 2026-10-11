from __future__ import annotations

from enum import StrEnum
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class TrajectoryEventKind(StrEnum):
    USER_INPUT = "user_input"
    ASSISTANT_OUTPUT = "assistant_output"
    SUBAGENT_START = "subagent_start"
    SUBAGENT_END = "subagent_end"
    TOOL_PROPOSAL = "tool_proposal"
    INTERRUPT = "interrupt"
    DECISION = "decision"
    TOOL_CALL = "tool_call"
    TOOL_RESULT = "tool_result"
    TOOL_ERROR = "tool_error"
    FINAL_RESPONSE = "final_response"


class ToolSource(StrEnum):
    TEAMSPACE = "teamspace"
    EXTERNAL_MCP = "external_mcp"
    UNKNOWN = "unknown"


class TrajectoryEvent(BaseModel):
    model_config = ConfigDict(frozen=True)

    sequence: int = Field(ge=0)
    kind: TrajectoryEventKind
    name: str | None = Field(default=None, max_length=160)
    attributes: dict[str, str | int | float | bool | None] = Field(
        default_factory=dict,
        max_length=64,
    )


class ObservedToolCall(BaseModel):
    model_config = ConfigDict(frozen=True)

    sequence: int = Field(ge=0)
    name: str = Field(min_length=1, max_length=160)
    source: ToolSource = ToolSource.UNKNOWN
    arguments: dict[str, Any] = Field(default_factory=dict)
    is_error: bool = False
    result_category: str | None = Field(default=None, max_length=120)


class ObservedMcpPrimitiveCall(BaseModel):
    model_config = ConfigDict(frozen=True)

    sequence: int = Field(ge=0)
    server_alias: str = Field(min_length=1, max_length=120)
    primitive: str = Field(min_length=1, max_length=120)
    name: str | None = Field(default=None, max_length=160)


class ObservedOutcome(BaseModel):
    model_config = ConfigDict(frozen=True)

    source: str = Field(min_length=1, max_length=120)
    payload: dict[str, Any] = Field(default_factory=dict)


class ObservedTrajectory(BaseModel):
    model_config = ConfigDict(frozen=True)

    case_id: str = Field(min_length=1, max_length=128)
    thread_id: str = Field(min_length=1, max_length=240)
    run_ids: list[str] = Field(min_length=1, max_length=64)
    run_statuses: list[str] = Field(default_factory=list[str], max_length=64)
    events: list[TrajectoryEvent] = Field(
        default_factory=list[TrajectoryEvent],
        max_length=5_000,
    )
    tools_called: list[ObservedToolCall] = Field(
        default_factory=list[ObservedToolCall],
        max_length=1_000,
    )
    mcp_primitives_called: list[ObservedMcpPrimitiveCall] = Field(
        default_factory=list[ObservedMcpPrimitiveCall],
        max_length=1_000,
    )
    outcomes: list[ObservedOutcome] = Field(
        default_factory=list[ObservedOutcome],
        max_length=256,
    )
    final_response: str | None = Field(default=None, max_length=64_000)
    turns: int = Field(default=0, ge=0)
    subagents: int = Field(default=0, ge=0)
    latency_ms: float = Field(default=0, ge=0)
    estimated_cost: float = Field(default=0, ge=0)

    def tool_names(self) -> list[str]:
        return [call.name for call in self.tools_called]

    def decision_events(self) -> list[TrajectoryEvent]:
        return [event for event in self.events if event.kind == TrajectoryEventKind.DECISION]
