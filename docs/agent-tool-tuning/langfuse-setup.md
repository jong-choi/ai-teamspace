# Langfuse로 측정하고 채점하는 방법

이 튜닝 기록의 측정과 채점에 쓴 로컬 Langfuse 구성과 실행 순서다. 로컬 개발 환경 전용이다.

## 구성

| 구성 요소           | 위치                                                               | 하는 일                                               |
| ------------------- | ------------------------------------------------------------------ | ----------------------------------------------------- |
| 로컬 Langfuse       | [infra/langfuse](../../infra/langfuse)                             | 트레이스와 점수를 저장하고 평가기를 실행한다          |
| 평가 전용 서버 스택 | 루트의 `compose.local.yaml`                                        | 개발 DB와 분리된 Postgres, Redis, Neo4j, 저장소       |
| 데모 시드           | [demo](../../demo)                                                 | 측정 대상 조직과 데이터                               |
| 회차 실행 스크립트  | [seeded-round.sh](../../evals/agent/scripts/seeded-round.sh)       | DB를 시드 상태로 되돌리고 서버를 띄워 케이스를 돌린다 |
| 채점 스크립트       | [langfuse_scores.py](../../evals/agent/scripts/langfuse_scores.py) | 평가기 등록, 실행 기록과 점수 업로드, 점수 수집       |
| 점수표 스크립트     | [score_report.py](../../evals/agent/scripts/score_report.py)       | 수집한 점수를 Markdown 표로 출력한다                  |

## 한 번만 하는 준비

1. `infra/langfuse/.env.example`을 `.env`로 복사하고 secret을 채운 뒤 `docker compose up -d`로 띄운다.
2. `server/.env`와 `evals/agent/.env`에 Langfuse 주소와 프로젝트 key를 넣는다.
3. 평가 전용 스택을 띄우고 데모 시드를 넣은 뒤 `./scripts/seeded-round.sh snapshot`으로 시드 직후 DB를 남긴다.
4. Langfuse 프로젝트 설정의 LLM Connections에 판정 모델 연결을 등록한다. 이 기록에서는 아래 값으로 등록했다.

   | 항목     | 값                      |
   | -------- | ----------------------- |
   | provider | `ollama-eval`           |
   | adapter  | `openai`                |
   | base URL | `https://ollama.com/v1` |
   | model    | `gpt-oss:120b`          |
   | key      | 평가 전용 Ollama key    |

5. `uv run python scripts/langfuse_scores.py setup`으로 평가기 7개와 평가 규칙을 등록한다.

평가 서버가 쓰는 Ollama key와 판정 모델 연결의 key는 제품이 쓰는 key와 다른 평가 전용 key다. 평가 서버용은 `evals/agent/.env`의 `EVAL_SERVER_OLLAMA_API_KEY`에 둔다.

## 회차 실행

`evals/agent`에서 실행한다.

```bash
./scripts/seeded-round.sh <회차 이름> <실행 횟수>
uv run python scripts/langfuse_scores.py push ../../.temp/evals/agent/<회차 이름>
uv run python scripts/langfuse_scores.py pull ../../.temp/evals/agent/<회차 이름>
uv run python scripts/score_report.py ../../.temp/evals/agent/<회차 이름> ../../.temp/evals/agent/<비교할 회차>
```

- `seeded-round.sh`는 서버를 빌드하고, 실행마다 DB를 시드 상태로 되돌리고 평가용 큐 Redis를 비운 뒤 서버를 띄워 26개 케이스를 차례로 돌린다. 서버는 회차 이름을 Langfuse release로 달고 실행 트레이스를 보낸다.
- `push`는 케이스마다 `eval-case` 관측 하나를 Langfuse에 올리고 기계 점수를 붙인다. 관측이 들어오면 평가 규칙이 평가기 7개를 실행한다.
- `pull`은 판정 점수가 다 붙을 때까지 기다렸다가 각 실행 폴더에 `scores.json`을 쓴다.
- 결과는 저장소의 `.temp/evals/agent/<회차 이름>/`에 남고 git으로 추적하지 않는다.

판정 모델과 에이전트가 같은 Ollama 계정을 쓰고 이 계정은 동시 호출이 1개다. `push`는 측정이 끝난 뒤에 실행한다.

## Langfuse에 남는 것

| 종류          | 이름                        | 내용                                                                   |
| ------------- | --------------------------- | ---------------------------------------------------------------------- |
| 실행 트레이스 | `agent-run`                 | 서버가 보낸 모델 호출, 도구 실행, 승인 단계. 내용은 1,000자에서 잘린다 |
| 채점용 관측   | `eval-case`                 | 요청, 도구 호출과 결과, 최종 답. 점수가 여기에 붙는다                  |
| 판정 실행     | `Execute evaluator: <이름>` | 판정 모델에 보낸 프롬프트와 출력                                       |

- 실행 트레이스는 내용이 잘려 있어서 판정에 쓰지 않는다. 하네스가 따로 저장한 실행 기록으로 `eval-case` 관측을 만든다.
- 모든 관측과 점수는 environment `tool-tuning`, release는 회차 이름이다. Langfuse 화면에서 release로 걸러 회차를 비교한다.

## 설정하면서 확인한 것

**판정 모델의 출력 형식.** Langfuse 평가기는 판정 모델에게 `score`와 `scoreExplanation` 두 필드를 가진 JSON을 요구한다. Ollama의 `gpt-oss:120b`는 형식 강제를 따르지 않고 맨 숫자를 내기도 한다. 그래서 평가기 프롬프트 끝에 출력 형식을 직접 적는다. 형식을 벗어난 출력은 점수가 저장되지 않으므로, `pull`이 알려 주는 빠진 점수 개수를 리포트에 적는다.

**평가기 동시 실행.** 평가 큐가 세 개이고 동시 실행 수 변수가 따로 있다. [compose.yaml](../../infra/langfuse/compose.yaml)은 세 변수를 `LANGFUSE_EVAL_EXECUTION_WORKER_CONCURRENCY` 하나로 맞춘다. 기본값은 1이다.

**도구 결과 저장 한도.** 하네스가 실행 기록에 도구 결과를 저장하는 한도가 6,000자일 때, 결과가 긴 케이스에서 판정 모델이 잘린 결과를 보고 "도구 결과에 없는 내용"이라고 잘못 판정했다. 한도를 60,000자로 올렸다. 한도에 걸린 케이스는 `scores.json`에 표시되고 점수표가 그 케이스를 뺀 평균을 따로 낸다.

**Langfuse v4 API.** 이 버전은 트레이스 목록과 구버전 점수 조회 API가 막혀 있다. 관측은 `/api/public/v2/observations`, 점수는 `/api/public/v3/scores`로 읽는다. 점수의 코멘트는 `fields=core,details`를 줘야 온다.

**평가용 큐 Redis.** 에이전트 실행의 재생용 스트림이 쌓여 메모리 한도에 걸린 적이 있다. 회차 스크립트가 실행마다 Redis를 비우고 스트림 보존 시간을 10분으로 줄인다.

## 판정 기준을 바꿀 때

평가기 프롬프트는 [langfuse_scores.py](../../evals/agent/scripts/langfuse_scores.py)의 `JUDGES`에 있다. 고친 뒤에는 `JUDGE_VERSION`을 올리고 `setup`을 다시 실행한다. 버전이 바뀌면 `push`가 새 관측을 만들어서, 이미 채점한 회차도 새 기준으로 다시 채점할 수 있다. 회차끼리 비교하려면 같은 버전으로 채점한 점수만 쓴다.

이 기록의 03 문서 이후 점수는 모두 `judge-2`다.
