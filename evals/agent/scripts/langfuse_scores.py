"""Score a seeded round in Langfuse.

    uv run python scripts/langfuse_scores.py setup
    uv run python scripts/langfuse_scores.py push .temp/evals/agent/<label>
    uv run python scripts/langfuse_scores.py pull .temp/evals/agent/<label>

setup  creates or updates the LLM-as-a-judge evaluators and the evaluation rule.
push   writes one `eval-case` observation per trial (request, tool transcript, answer)
       and the scores that can be counted mechanically. The evaluation rule then runs
       the judges on each `eval-case` observation.
pull   waits for the judge scores and writes scores.json next to each pass report.

The judge model is the Langfuse LLM connection named by EVAL_LANGFUSE_JUDGE_PROVIDER.
"""

# ruff: noqa: E501
from __future__ import annotations

import hashlib
import json
import os
import re
import sys
import time
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from config.settings import load_settings  # noqa: E402

OBSERVATION_NAME = "eval-case"
# Tool result capture limits the harness has used (runner/raw_trace.py).
RAW_TEXT_LIMITS = {6_000, 60_000}
# Bump when a judge prompt changes so re-scored rounds get fresh traces.
JUDGE_VERSION = "judge-2"
RULE_NAME = "tool-tuning eval-case"
JUDGE_PROVIDER = os.environ.get("EVAL_LANGFUSE_JUDGE_PROVIDER", "ollama-eval")
JUDGE_MODEL = os.environ.get("EVAL_LANGFUSE_JUDGE_MODEL", "gpt-oss:120b")
DATASET_PATH = Path("datasets/tool-calling/tool-calling.json")
# Set to one case id to score only that case (smoke test).
ONLY_CASE = os.environ.get("EVAL_SCORE_ONLY_CASE", "")

# USD per 1M tokens for the agent model.
INPUT_PRICE = 0.15
OUTPUT_PRICE = 0.60

BUILTIN_TOOLS = {
    "ls",
    "read_file",
    "write_file",
    "edit_file",
    "delete",
    "glob",
    "grep",
    "task",
}
UUID_PATTERN = re.compile(
    r"[0-9a-fA-F]{8}[-‑][0-9a-fA-F]{4}[-‑][0-9a-fA-F]{4}[-‑][0-9a-fA-F]{4}[-‑][0-9a-fA-F]{12}"
)
OPAQUE_ID_PATTERN = re.compile(r"\b(?=[A-Za-z0-9]*\d)(?=[A-Za-z0-9]*[a-z])[A-Za-z0-9]{32}\b")

_SHARED = """아래는 업무 도구를 쓰는 AI 에이전트의 실행 기록이다.

[사용자 요청과 도구 호출 기록]
{{input}}

[에이전트의 최종 답]
{{output}}

"""

_OUTPUT_FORMAT = {
    "NUMERIC": "\n\n[채점 결과 쓰는 법] 채점 결과는 아래 형식의 JSON 객체 하나로만 쓴다.\n"
    '{"score": 0과 1 사이의 숫자, "scoreExplanation": "근거 한두 문장"}',
    "BOOLEAN": "\n\n[채점 결과 쓰는 법] 위 기록에 대한 채점 결과를 아래 형식의 JSON 객체 하나로만 쓴다.\n"
    '{"score": true 또는 false, "scoreExplanation": "근거 한두 문장"}',
}

JUDGES: list[dict[str, Any]] = [
    {
        "name": "faithfulness",
        "dataType": "NUMERIC",
        "prompt": _SHARED + "최종 답의 내용이 도구 결과에 근거하는지 0~1로 채점한다.\n"
        "- 1: 답의 사실이 모두 도구 결과에 있다.\n"
        "- 0.5: 대부분 도구 결과에 있지만 없는 내용을 조금 덧붙였거나 일부 결과를 전체인 것처럼 말했다.\n"
        "- 0: 도구 결과와 다르거나 도구 결과에 없는 사실을 지어냈다. 최종 답이 비어 있어도 0이다.\n"
        "조직의 업무 데이터에 대한 사실만 본다. 인사말, 후속 제안, 에이전트가 할 수 있는 일과 없는 일에 대한 설명은 채점하지 않는다.\n"
        "도구 호출의 인자에 있는 값과 시스템 컨텍스트의 값은 근거로 인정한다.\n"
        "도구를 부르지 않은 실행은 답이 요청과 시스템 컨텍스트만으로 뒷받침되는지로 본다.\n"
        "근거에는 도구 결과에 없는 문장을 그대로 인용한다.",
    },
    {
        "name": "answer_quality",
        "dataType": "NUMERIC",
        "prompt": _SHARED
        + "최종 답이 사용자에게 쓸모 있는지 0~1로 채점한다. 사실이 맞는지는 보지 않는다.\n"
        "- 1: 요청한 것에 바로 답하고 군더더기가 없다.\n"
        "- 0.5: 답은 했지만 요청에 비해 장황하거나, 같은 내용을 반복하거나, 내부 ID·도구 이름 같은 사용자가 쓸 수 없는 값을 적었다.\n"
        "- 0: 답이 없거나, 도구 호출용 글자나 내부 추론이 그대로 나갔거나, 사용자가 쓸 수 없는 글이다.",
    },
    {
        "name": "tool_selection",
        "dataType": "NUMERIC",
        "prompt": _SHARED
        + "에이전트가 요청에 맞는 도구를 골라 썼는지 0~1로 채점한다. 답의 문장은 보지 않는다.\n"
        "- 1: 필요한 도구만 맞는 순서로 불렀다. 도구가 필요 없는 요청에 도구를 안 부른 것도 1이다.\n"
        "- 0.5: 결국 맞는 도구를 썼지만 필요 없는 호출, 같은 호출의 반복, 엉뚱한 도구 시도가 있었다.\n"
        "- 0: 필요한 도구를 부르지 않았거나 요청과 다른 일을 하는 도구를 불렀다.",
    },
    {
        "name": "knowledge_graph_faithfulness",
        "dataType": "NUMERIC",
        "prompt": _SHARED
        + "지식 그래프 도구(knowledge_search, knowledge_get_context)의 결과를 답이 충실히 옮겼는지 0~1로 채점한다.\n"
        '그래프의 관계는 도구 결과의 relations에 "A -[관계]-> B" 형식으로 들어 있다.\n'
        "- 1: 답이 관계라고 적은 것이 모두 relations에 있고 방향도 같다.\n"
        "- 0.5: relations의 관계는 맞게 옮겼지만 relations에 없는 관계를 일부 섞어 적었다.\n"
        "- 0: relations에 없는 관계를 여러 개 지어냈거나 방향을 틀리게 적었다.\n"
        "relations에 있는데 답이 옮기지 않은 관계는 감점하지 않는다.\n"
        "지식 그래프 도구를 한 번도 부르지 않았으면 1로 채점하고 근거에 '해당 없음'이라고 적는다.",
    },
    {
        "name": "task_completed",
        "dataType": "BOOLEAN",
        "prompt": _SHARED + "사용자가 시킨 일이 끝났는지 판정한다.\n"
        "- 참: 조회 요청이면 요청한 정보를 답했다. 변경 요청이면 요청한 값대로 변경 도구가 성공했다. "
        "할 수 없는 일이면 못 한다고 분명히 알렸다.\n"
        "- 거짓: 답이 없거나, 요청과 다른 값으로 변경했거나, 변경 도구가 성공하지 않았는데 했다고 답했다.",
    },
    {
        "name": "language_match",
        "dataType": "BOOLEAN",
        "prompt": _SHARED + "최종 답이 사용자 요청과 같은 언어로 쓰였는지 판정한다.\n"
        "- 참: 같은 언어다. 고유명사나 코드 값이 다른 언어인 것은 괜찮다.\n"
        "- 거짓: 다른 언어로 답했거나 답이 없다.",
    },
    {
        "name": "datetime_accuracy",
        "dataType": "BOOLEAN",
        "prompt": _SHARED + "최종 답에 적힌 날짜, 요일, 시각이 맞는지 판정한다.\n"
        "시스템 컨텍스트의 current_time과 time_zone, 도구 결과의 시각(UTC는 Z로 끝난다)을 기준으로 직접 계산해서 확인한다.\n"
        "- 참: 답에 적힌 날짜·요일·시각이 모두 맞다. 답이 적지 않은 것은 문제 삼지 않는다. 요일을 안 적은 것도 참이다.\n"
        "- 거짓: 요일이 틀렸거나, 시간대 변환이 틀렸거나, 시간대 표시 없이 UTC 시각을 그대로 적었다.",
    },
]


def _output_definition(data_type: str) -> dict[str, Any]:
    score: dict[str, Any] = {"description": "채점 기준에 따른 점수"}
    if data_type == "NUMERIC":
        score |= {"minValue": 0, "maxValue": 1}
    return {
        "dataType": data_type,
        "reasoning": {"description": "점수의 근거 한두 문장"},
        "score": score,
    }


def _stable_id(*parts: str, length: int = 32) -> str:
    return hashlib.sha256("|".join(parts).encode()).hexdigest()[:length]


def _client() -> httpx.Client:
    settings = load_settings()
    if not (
        settings.langfuse_base_url and settings.langfuse_public_key and settings.langfuse_secret_key
    ):
        raise SystemExit("EVAL_LANGFUSE_BASE_URL and keys are required")
    return httpx.Client(
        base_url=settings.langfuse_base_url,
        auth=(
            settings.langfuse_public_key,
            settings.langfuse_secret_key.get_secret_value(),
        ),
        timeout=60,
    )


def _check(response: httpx.Response) -> Any:
    if response.status_code >= 400:
        raise SystemExit(
            f"{response.request.method} {response.request.url.path} -> "
            f"{response.status_code} {response.text[:500]}"
        )
    return response.json() if response.content else None


def setup() -> None:
    with _client() as client:
        existing = {
            item["name"]: item["id"]
            for item in _check(client.get("/api/public/v2/evaluators"))["data"]
        }
        evaluator_ids: list[str] = []
        for judge in JUDGES:
            body = {
                "type": "llm_as_judge",
                "name": judge["name"],
                "prompt": judge["prompt"] + _OUTPUT_FORMAT[judge["dataType"]],
                "outputDefinition": _output_definition(judge["dataType"]),
                "modelConfig": {"provider": JUDGE_PROVIDER, "model": JUDGE_MODEL},
                "variableMapping": [
                    {"variable": "input", "source": "input"},
                    {"variable": "output", "source": "output"},
                ],
            }
            if judge["name"] in existing:
                result = _check(
                    client.patch(f"/api/public/v2/evaluators/{existing[judge['name']]}", json=body)
                )
            else:
                result = _check(client.post("/api/public/v2/evaluators", json=body))
            print(f"evaluator {result['name']}: {result['status']} v{result['version']}")
            evaluator_ids.append(result["id"])

        rules = {
            item["name"]: item["id"]
            for item in _check(client.get("/api/public/v2/evaluation-rules"))["data"]
        }
        rule_body = {
            "name": RULE_NAME,
            "enabled": True,
            "sampling": 1,
            "filter": [
                {
                    "column": "name",
                    "operator": "any of",
                    "value": [OBSERVATION_NAME],
                    "type": "stringOptions",
                }
            ],
            "evaluatorAssignments": [
                {"evaluatorId": evaluator_id} for evaluator_id in evaluator_ids
            ],
        }
        if RULE_NAME in rules:
            result = _check(
                client.patch(f"/api/public/v2/evaluation-rules/{rules[RULE_NAME]}", json=rule_body)
            )
        else:
            result = _check(client.post("/api/public/v2/evaluation-rules", json=rule_body))
        print(f"rule {result['name']}: enabled={result.get('enabled')}")


def _load(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def _transcript(raw: dict[str, Any]) -> str:
    lines: list[str] = []
    for message in raw.get("messages", []):
        kind = message.get("type")
        text = str(message.get("text") or "")
        if kind == "human":
            lines.append(f"[사용자]\n{text}")
        elif kind == "ai":
            for call in message.get("tool_calls") or []:
                arguments = json.dumps(call.get("args") or {}, ensure_ascii=False)
                lines.append(f"[도구 호출] {call.get('name')} {arguments}")
        elif kind == "tool":
            status = "오류" if _is_error(message) else "성공"
            lines.append(f"[도구 결과: {message.get('name')} {status}]\n{text}")
    return "\n\n".join(lines)


def _is_error(message: dict[str, Any]) -> bool:
    return message.get("status") == "error" or str(message.get("text") or "").startswith("Error")


def _mechanical_scores(
    trial: dict[str, Any], raw: dict[str, Any], expected_approvals: int
) -> dict[str, tuple[str, float]]:
    messages = raw.get("messages", [])
    tool_results = [message for message in messages if message.get("type") == "tool"]
    calls = [
        call
        for message in messages
        if message.get("type") == "ai"
        for call in message.get("tool_calls") or []
    ]
    answer = str(raw.get("final_response") or "")
    model_calls = raw.get("model_calls", [])
    input_tokens = sum(int(call.get("input_tokens") or 0) for call in model_calls)
    output_tokens = sum(int(call.get("output_tokens") or 0) for call in model_calls)

    scores: dict[str, tuple[str, float]] = {
        "harness_pass": ("BOOLEAN", 1 if trial["passed"] else 0),
        "tool_errors": ("NUMERIC", sum(1 for result in tool_results if _is_error(result))),
        "extra_approvals": (
            "NUMERIC",
            max(0, len(raw.get("run_ids", [])) - 1 - expected_approvals),
        ),
        "internal_id_leak": (
            "BOOLEAN",
            1 if UUID_PATTERN.search(answer) or OPAQUE_ID_PATTERN.search(answer) else 0,
        ),
        "answer_chars": ("NUMERIC", len(answer)),
        "model_calls": ("NUMERIC", len(model_calls)),
        "input_tokens": ("NUMERIC", input_tokens),
        "output_tokens": ("NUMERIC", output_tokens),
        "cost_usd": (
            "NUMERIC",
            round((input_tokens * INPUT_PRICE + output_tokens * OUTPUT_PRICE) / 1e6, 6),
        ),
    }

    invalid_tools = {
        str(result.get("name"))
        for result in tool_results
        if "is not a valid tool" in str(result.get("text") or "")
    }
    seen: set[str] = set()
    unneeded = 0
    for call in calls:
        name = str(call.get("name"))
        key = name + json.dumps(call.get("args") or {}, sort_keys=True, ensure_ascii=False)
        if name in BUILTIN_TOOLS or name in invalid_tools or key in seen:
            unneeded += 1
        seen.add(key)
    scores["unneeded_calls"] = ("NUMERIC", unneeded)

    if tool_results:
        scores["first_call_ok"] = ("BOOLEAN", 0 if _is_error(tool_results[0]) else 1)

    errors = 0
    recovered = 0
    for index, result in enumerate(tool_results):
        if not _is_error(result):
            continue
        errors += 1
        later = [
            item for item in tool_results[index + 1 :] if item.get("name") == result.get("name")
        ]
        if later and not _is_error(later[0]):
            recovered += 1
    if errors:
        scores["error_recovery"] = ("NUMERIC", round(recovered / errors, 3))

    return scores


def _otlp_span(
    trace_id: str, label: str, case_id: str, tags: list[str], request: str, answer: str
) -> dict[str, Any]:
    now = time.time_ns()

    def attribute(key: str, value: str) -> dict[str, Any]:
        return {"key": key, "value": {"stringValue": value}}

    return {
        "resourceSpans": [
            {
                "resource": {"attributes": [attribute("service.name", "agent-eval")]},
                "scopeSpans": [
                    {
                        "scope": {"name": "agent-eval"},
                        "spans": [
                            {
                                "traceId": trace_id,
                                "spanId": _stable_id(trace_id, "root", length=16),
                                "name": OBSERVATION_NAME,
                                "kind": 1,
                                "startTimeUnixNano": str(now - 1_000_000),
                                "endTimeUnixNano": str(now),
                                "attributes": [
                                    attribute("langfuse.observation.type", "span"),
                                    attribute("langfuse.observation.input", request),
                                    attribute("langfuse.observation.output", answer),
                                    attribute("langfuse.observation.metadata.case_id", case_id),
                                    attribute(
                                        "langfuse.trace.name", f"{OBSERVATION_NAME}:{case_id}"
                                    ),
                                    attribute("langfuse.trace.metadata.case_id", case_id),
                                    attribute("langfuse.environment", "tool-tuning"),
                                    attribute("langfuse.release", label),
                                    attribute("langfuse.version", label),
                                    {
                                        "key": "langfuse.trace.tags",
                                        "value": {
                                            "arrayValue": {
                                                "values": [{"stringValue": tag} for tag in tags]
                                            }
                                        },
                                    },
                                ],
                            }
                        ],
                    }
                ],
            }
        ]
    }


def _trials(round_dir: Path) -> list[tuple[Path, dict[str, Any], dict[str, Any], str]]:
    label = round_dir.name
    rows: list[tuple[Path, dict[str, Any], dict[str, Any], str]] = []
    for pass_dir in sorted(path for path in round_dir.glob("pass-*") if path.is_dir()):
        report_path = pass_dir / "report.json"
        if not report_path.exists():
            continue
        for trial in _load(report_path)["trials"]:
            raw_path = pass_dir / "raw" / f"{trial['case_id']}.trial-{trial['trial']}.json"
            trace_id = _stable_id(
                label, pass_dir.name, trial["case_id"], str(trial["trial"]), JUDGE_VERSION
            )
            if ONLY_CASE and trial["case_id"] != ONLY_CASE:
                continue
            rows.append((pass_dir, trial, _load(raw_path), trace_id))
    return rows


def push(round_dir: Path) -> None:
    label = round_dir.name
    cases = {case["id"]: case for case in _load(DATASET_PATH)["cases"]}
    with _client() as client:
        for pass_dir, trial, raw, trace_id in _trials(round_dir):
            case = cases[trial["case_id"]]
            _check(
                client.post(
                    "/api/public/otel/v1/traces",
                    json=_otlp_span(
                        trace_id,
                        label,
                        trial["case_id"],
                        [label, pass_dir.name, *case.get("tags", [])],
                        _transcript(raw),
                        str(raw.get("final_response") or ""),
                    ),
                )
            )
            scores = _mechanical_scores(trial, raw, len(case.get("expected_interrupts", [])))
            for name, (data_type, value) in scores.items():
                _check(
                    client.post(
                        "/api/public/scores",
                        json={
                            "id": _stable_id(trace_id, name),
                            "traceId": trace_id,
                            "name": name,
                            "value": value,
                            "dataType": data_type,
                            "environment": "tool-tuning",
                        },
                    )
                )
            print(f"{pass_dir.name} {trial['case_id']}: {len(scores)} scores, trace {trace_id}")


def pull(round_dir: Path, timeout_seconds: int = 3600, stall_polls: int = 8) -> None:
    judge_names = {judge["name"] for judge in JUDGES}
    rows = _trials(round_dir)
    deadline = time.time() + timeout_seconds
    with _client() as client:
        collected: dict[str, dict[str, Any]] = {}
        last_pending = -1
        stalled = 0
        while True:
            pending = 0
            for _pass_dir, _trial, _raw, trace_id in rows:
                data = _check(
                    client.get(
                        "/api/public/v3/scores",
                        params={"traceId": trace_id, "limit": 100, "fields": "core,details"},
                    )
                )["data"]
                collected[trace_id] = {
                    item["name"]: {"value": item["value"], "comment": item.get("comment")}
                    for item in data
                }
                if not judge_names <= set(collected[trace_id]):
                    pending += 1
            # A judge whose output did not parse never writes a score, so stop once
            # nothing new has arrived for a few polls instead of waiting for the timeout.
            stalled = stalled + 1 if pending == last_pending else 0
            last_pending = pending
            if pending == 0 or stalled >= stall_polls or time.time() > deadline:
                break
            print(f"waiting: {pending}/{len(rows)} trials still missing judge scores", flush=True)
            time.sleep(30)

    by_pass: dict[Path, dict[str, Any]] = {}
    for pass_dir, trial, raw, trace_id in rows:
        by_pass.setdefault(pass_dir, {})[trial["case_id"]] = {
            "trace_id": trace_id,
            # The judge only saw the captured part of a tool result that hit the capture limit.
            "transcript_truncated": any(
                len(str(message.get("text") or "")) in RAW_TEXT_LIMITS
                for message in raw.get("messages", [])
                if message.get("type") == "tool"
            ),
            "scores": collected[trace_id],
        }
    for pass_dir, cases in by_pass.items():
        payload = {"pulled_at": datetime.now(UTC).isoformat(), "cases": cases}
        (pass_dir / "scores.json").write_text(
            json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        print(f"wrote {pass_dir / 'scores.json'} (missing judge scores: {pending})")


def main() -> int:
    command = sys.argv[1] if len(sys.argv) > 1 else ""
    if command == "setup":
        setup()
    elif command in {"push", "pull"} and len(sys.argv) > 2:
        (push if command == "push" else pull)(Path(sys.argv[2]))
    else:
        raise SystemExit(__doc__)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
