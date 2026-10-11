"""Print the Langfuse scores of one seeded round as Markdown.

    uv run python scripts/score_report.py .temp/evals/agent/<label> [.temp/evals/agent/<previous>]

Reads the scores.json that `langfuse_scores.py pull` wrote next to each pass report.
With a previous round, the summary table shows both rounds side by side.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from statistics import mean
from typing import Any

JUDGE_SCORES = [
    "tool_selection",
    "faithfulness",
    "knowledge_graph_faithfulness",
    "answer_quality",
    "task_completed",
    "language_match",
    "datetime_accuracy",
]
MECHANICAL_SCORES = [
    "harness_pass",
    "first_call_ok",
    "error_recovery",
    "tool_errors",
    "unneeded_calls",
    "extra_approvals",
    "internal_id_leak",
    "answer_chars",
    "model_calls",
    "input_tokens",
    "output_tokens",
    "cost_usd",
]
# Summed over the round instead of averaged.
TOTALS = {
    "tool_errors",
    "unneeded_calls",
    "extra_approvals",
    "input_tokens",
    "output_tokens",
    "cost_usd",
}
# The knowledge graph judge only means something where the graph tools were the point.
KNOWLEDGE_TAG = "knowledge"
DATASET_PATH = Path("datasets/tool-calling/tool-calling.json")


def _load_round(round_dir: Path) -> list[tuple[str, str, dict[str, Any]]]:
    rows: list[tuple[str, str, dict[str, Any]]] = []
    for scores_path in sorted(round_dir.glob("pass-*/scores.json")):
        payload = json.loads(scores_path.read_text(encoding="utf-8"))
        for case_id, entry in payload["cases"].items():
            scores = dict(entry["scores"])
            scores["_truncated"] = {"value": 1 if entry.get("transcript_truncated") else 0}
            rows.append((scores_path.parent.name, case_id, scores))
    if not rows:
        raise SystemExit(f"no pass-*/scores.json under {round_dir}")
    return rows


def _value(scores: dict[str, Any], name: str) -> float | None:
    entry = scores.get(name)
    return None if entry is None else float(entry["value"])


def _aggregate(
    rows: list[tuple[str, str, dict[str, Any]]], name: str, knowledge_cases: set[str]
) -> tuple[str, int]:
    values = [
        value
        for _pass, case_id, scores in rows
        if name != "knowledge_graph_faithfulness" or case_id in knowledge_cases
        if (value := _value(scores, name)) is not None
    ]
    if not values:
        return "-", 0
    if name in TOTALS:
        total = sum(values)
        return (f"{total:.4f}" if name == "cost_usd" else f"{total:,.0f}"), len(values)
    return f"{mean(values):.2f}", len(values)


def _format(value: float | None) -> str:
    if value is None:
        return "-"
    return f"{value:g}"


def main() -> int:
    if len(sys.argv) < 2:
        raise SystemExit(__doc__)
    cases = json.loads(DATASET_PATH.read_text(encoding="utf-8"))["cases"]
    knowledge_cases = {case["id"] for case in cases if KNOWLEDGE_TAG in case.get("tags", [])}
    order = [case["id"] for case in cases]

    rounds = [(Path(arg).name, _load_round(Path(arg))) for arg in sys.argv[1:3]]
    current_label, current = rounds[0]

    print(f"## {current_label}\n")
    header = "| score | " + " | ".join(label for label, _ in rounds) + " |"
    print(header)
    print("|---|" + "---|" * len(rounds))
    for name in [*JUDGE_SCORES, *MECHANICAL_SCORES]:
        cells = []
        for _label, rows in rounds:
            text, count = _aggregate(rows, name, knowledge_cases)
            cells.append(f"{text} (n={count})")
        kind = "sum" if name in TOTALS else "mean"
        print(f"| {name} ({kind}) | " + " | ".join(cells) + " |")

    print("\nJudge means over trials whose tool results were captured in full:\n")
    print(header)
    print("|---|" + "---|" * len(rounds))
    for name in JUDGE_SCORES:
        cells = []
        for _label, rows in rounds:
            full = [row for row in rows if not _value(row[2], "_truncated")]
            text, count = _aggregate(full, name, knowledge_cases)
            cells.append(f"{text} (n={count})")
        print(f"| {name} | " + " | ".join(cells) + " |")

    trials = len(current)
    missing = sum(1 for _p, _c, scores in current for name in JUDGE_SCORES if name not in scores)
    print(f"\n- trials: {trials}, judge scores missing: {missing}/{trials * len(JUDGE_SCORES)}\n")

    print(
        "| pass | case | "
        + " | ".join(JUDGE_SCORES)
        + " | harness | errors | unneeded | truncated |"
    )
    print("|---|---|" + "---|" * (len(JUDGE_SCORES) + 4))
    for pass_name, case_id, scores in sorted(
        current, key=lambda row: (row[0], order.index(row[1]))
    ):
        cells = [
            _format(_value(scores, name))
            if name != "knowledge_graph_faithfulness" or case_id in knowledge_cases
            else "n/a"
            for name in JUDGE_SCORES
        ]
        extra = [
            _format(_value(scores, name))
            for name in ("harness_pass", "tool_errors", "unneeded_calls", "_truncated")
        ]
        print(f"| {pass_name} | {case_id} | " + " | ".join([*cells, *extra]) + " |")

    print("\n### judge comments on scores below 1\n")
    for pass_name, case_id, scores in sorted(
        current, key=lambda row: (row[0], order.index(row[1]))
    ):
        for name in JUDGE_SCORES:
            if name == "knowledge_graph_faithfulness" and case_id not in knowledge_cases:
                continue
            value = _value(scores, name)
            if value is not None and value < 1:
                comment = str(scores[name].get("comment") or "").replace("\n", " ")
                print(f"- {pass_name} {case_id} {name}={value:g}: {comment}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
