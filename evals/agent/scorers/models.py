from __future__ import annotations

from enum import StrEnum

from pydantic import BaseModel, ConfigDict, Field


class FailureType(StrEnum):
    PROTOCOL_FAILURE = "protocol_failure"
    AUTH_FAILURE = "auth_failure"
    MCP_DISCOVERY_FAILURE = "mcp_discovery_failure"
    TOOL_SELECTION_FAILURE = "tool_selection_failure"
    TOOL_ARGUMENT_FAILURE = "tool_argument_failure"
    TOOL_EXECUTION_FAILURE = "tool_execution_failure"
    HITL_FAILURE = "hitl_failure"
    SUBAGENT_FAILURE = "subagent_failure"
    TASK_OUTCOME_FAILURE = "task_outcome_failure"
    ANSWER_QUALITY_FAILURE = "answer_quality_failure"
    SECURITY_FAILURE = "security_failure"
    INFRASTRUCTURE_FAILURE = "infrastructure_failure"
    BUDGET_TIMEOUT = "budget_timeout"
    BUDGET_EXCEEDED = "budget_exceeded"


class AssertionResult(BaseModel):
    model_config = ConfigDict(frozen=True)

    name: str = Field(min_length=1, max_length=180)
    passed: bool
    failure_type: FailureType | None = None
    message: str = Field(max_length=500)
    critical: bool = True


class DeterministicScore(BaseModel):
    model_config = ConfigDict(frozen=True)

    passed: bool
    assertions: list[AssertionResult]

    def failures(self) -> list[AssertionResult]:
        return [result for result in self.assertions if not result.passed]
