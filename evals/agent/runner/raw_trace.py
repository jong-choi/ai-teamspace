from __future__ import annotations

import json
import re
from collections.abc import Mapping
from pathlib import Path
from typing import Any

from datasets.schema import EvalCase
from fixtures.lifecycle import FixtureLease
from runner.trajectory import ObservedTrajectory

RAW_TEXT_LIMIT = 6_000
_UNSAFE_FILE_CHARACTERS = re.compile(r"[^a-z0-9._-]+")


def raw_trace_path(raw_dir: Path, case: EvalCase, lease: FixtureLease) -> Path:
    trial = lease.owner.rsplit(":", 1)[-1].lower()
    return raw_dir / f"{case.id}.{_UNSAFE_FILE_CHARACTERS.sub('-', trial)}.json"


def write_raw_trace(
    raw_dir: Path,
    case: EvalCase,
    lease: FixtureLease,
    trajectory: ObservedTrajectory,
    *,
    client_context: Mapping[str, object] | None,
    tool_outputs: Mapping[int, str],
    model_calls: list[dict[str, Any]],
    messages: list[dict[str, Any]],
) -> Path:
    """Write the unredacted local trace a reviewer reads; it never enters the report.

    The report keeps only tool names. Reviewing why a tool call failed needs the
    arguments, the tool's reply and the token usage, so they are kept in a local file.
    """

    payload: dict[str, Any] = {
        "case_id": case.id,
        "owner": lease.owner,
        "input": list(case.input),
        "client_context": dict(client_context) if client_context else None,
        "thread_id": trajectory.thread_id,
        "run_ids": trajectory.run_ids,
        "run_statuses": trajectory.run_statuses,
        "events": [
            {"sequence": event.sequence, "kind": event.kind.value, "name": event.name}
            for event in trajectory.events
        ],
        "tool_calls": [
            {
                "sequence": call.sequence,
                "name": call.name,
                "source": call.source.value,
                "arguments": call.arguments,
                "is_error": call.is_error,
                "result_category": call.result_category,
                "output": tool_outputs.get(call.sequence),
            }
            for call in trajectory.tools_called
        ],
        "model_calls": model_calls,
        "messages": messages,
        "final_response": trajectory.final_response,
        "turns": trajectory.turns,
        "subagents": trajectory.subagents,
        "latency_ms": trajectory.latency_ms,
    }
    raw_dir.mkdir(parents=True, exist_ok=True)
    path = raw_trace_path(raw_dir, case, lease)
    path.write_text(
        json.dumps(payload, indent=2, ensure_ascii=False, default=str) + "\n",
        encoding="utf-8",
    )
    return path
