"""Summarize one seeded round: per-case results across passes and tool text size.

    uv run python scripts/summarize_round.py .temp/evals/agent/<label>

Reads each pass's report.json, raw traces and tool-manifest.json and prints Markdown.
"""

from __future__ import annotations

import json
import sys
from collections import defaultdict
from pathlib import Path
from typing import Any


def _load(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def _tool_errors(raw: dict[str, Any]) -> int:
    return sum(
        1
        for message in raw.get("messages", [])
        if message.get("type") == "tool"
        and (
            message.get("status") == "error"
            or str(message.get("text") or "").startswith("Error")
        )
    )


def _manifest_size(tools: list[dict[str, Any]]) -> dict[str, int]:
    descriptions = sum(len(str(tool.get("description") or "")) for tool in tools)
    schemas = sum(
        len(json.dumps(tool.get("inputSchema") or {}, ensure_ascii=False))
        for tool in tools
    )
    return {"tools": len(tools), "description_chars": descriptions, "schema_chars": schemas}


def main() -> int:
    round_dir = Path(sys.argv[1])
    passes = sorted(path for path in round_dir.glob("pass-*") if path.is_dir())
    if not passes:
        raise SystemExit(f"no pass-* directories under {round_dir}")

    rows: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for pass_dir in passes:
        report = _load(pass_dir / "report.json")
        for trial in report["trials"]:
            raw_path = pass_dir / "raw" / f"{trial['case_id']}.trial-{trial['trial']}.json"
            raw = _load(raw_path) if raw_path.exists() else {}
            model_calls = raw.get("model_calls", [])
            rows[trial["case_id"]].append(
                {
                    "passed": trial["passed"],
                    "failures": trial["failure_types"],
                    "tools": trial["trajectory"]["tools_called"],
                    "errors": _tool_errors(raw),
                    "model_calls": len(model_calls),
                    "input_tokens": sum(call.get("input_tokens") or 0 for call in model_calls),
                    "first_input_tokens": (model_calls[0].get("input_tokens") or 0)
                    if model_calls
                    else 0,
                    "latency_s": trial["trajectory"]["latency_ms"] / 1000,
                    "run_status": (trial["trajectory"]["run_statuses"] or ["-"])[-1],
                }
            )

    total = sum(len(items) for items in rows.values())
    passed = sum(item["passed"] for items in rows.values() for item in items)
    clean = sum(
        item["errors"] == 0 and item["run_status"] == "success"
        for items in rows.values()
        for item in items
    )
    errors = sum(item["errors"] for items in rows.values() for item in items)
    tool_calls = sum(len(item["tools"]) for items in rows.values() for item in items)
    tokens = sum(item["input_tokens"] for items in rows.values() for item in items)
    first_tokens = [
        item["first_input_tokens"]
        for items in rows.values()
        for item in items
        if item["first_input_tokens"]
    ]
    size = _manifest_size(_load(passes[0] / "tool-manifest.json"))

    print(f"## {round_dir.name}\n")
    print(f"- passes: {len(passes)}, cases: {len(rows)}, trials: {total}")
    print(f"- passed trials: {passed}/{total} ({passed / total:.0%})")
    print(f"- trials with no tool error and a successful run: {clean}/{total}")
    print(f"- tool calls: {tool_calls}, tool errors: {errors}")
    print(f"- input tokens (all model calls): {tokens}")
    if first_tokens:
        print(f"- first-call input tokens (median): {sorted(first_tokens)[len(first_tokens) // 2]}")
    print(
        f"- MCP tools: {size['tools']}, description chars: {size['description_chars']}, "
        f"input schema chars: {size['schema_chars']}\n"
    )
    print("| case | pass | errors | tool calls | model calls | latency s | failures |")
    print("|---|---|---|---|---|---|---|")
    for case_id, items in rows.items():
        failures = sorted({failure for item in items for failure in item["failures"]})
        print(
            f"| {case_id} | {sum(item['passed'] for item in items)}/{len(items)} "
            f"| {sum(item['errors'] for item in items)} "
            f"| {'/'.join(str(len(item['tools'])) for item in items)} "
            f"| {'/'.join(str(item['model_calls']) for item in items)} "
            f"| {'/'.join(f'{item['latency_s']:.0f}' for item in items)} "
            f"| {', '.join(failures) or '-'} |"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
