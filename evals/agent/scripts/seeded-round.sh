#!/usr/bin/env bash
# 시드된 workspace에서 dataset을 여러 번 돌린다. 매번 시드 직후 상태로 DB를 되돌려
# 쓰기 케이스가 다음 실행에 영향을 주지 않게 한다.
#
#   scripts/seeded-round.sh <label> [passes]
#
# 먼저 `scripts/seeded-round.sh snapshot`으로 시드 직후 DB를 template으로 남겨 둔다.
# 결과는 .temp/evals/agent/<label>/pass-<n>에 쌓인다.
set -euo pipefail

cd "$(dirname "$0")/.."
REPO_ROOT="$(cd ../.. && pwd)"
set -a
# shellcheck disable=SC1091
. "$REPO_ROOT/.env"
set +a

POSTGRES_CONTAINER="${EVAL_POSTGRES_CONTAINER:-workos-agent-eval-postgres-1}"
SNAPSHOT_DB="${POSTGRES_DB}_seed_snapshot"
STATE_DIR="$REPO_ROOT/.temp/agent-eval"
SERVER_URL="${EVAL_SERVER_URL:-http://localhost:3200}"
DATASET="${EVAL_DATASET_PATH:-datasets/tool-calling/tool-calling.json}"
mkdir -p "$STATE_DIR"

psql_admin() {
  docker exec -e PGPASSWORD="$POSTGRES_PASSWORD" "$POSTGRES_CONTAINER" \
    psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d postgres -q -c "$1"
}

stop_server() {
  if [[ -f "$STATE_DIR/server.pid" ]]; then
    kill "$(cat "$STATE_DIR/server.pid")" 2>/dev/null || true
    rm -f "$STATE_DIR/server.pid"
  fi
  # 포트가 비워질 때까지 기다린다.
  for _ in $(seq 1 30); do
    curl -sf "$SERVER_URL/info" >/dev/null 2>&1 || return 0
    sleep 1
  done
  echo "server did not stop" >&2
  exit 1
}

start_server() {
  (
    cd "$REPO_ROOT/server"
    LANGFUSE_ENABLED=true \
      LANGFUSE_CAPTURE_LEVEL=sanitized-content \
      LANGFUSE_TRACING_ENVIRONMENT=tool-tuning \
      LANGFUSE_RELEASE="$1" \
      nohup node dist/main.js >"$STATE_DIR/server.log" 2>&1 &
    echo $! >"$STATE_DIR/server.pid"
  )
  for _ in $(seq 1 60); do
    curl -sf "$SERVER_URL/info" >/dev/null 2>&1 && return 0
    sleep 1
  done
  echo "server did not start; see $STATE_DIR/server.log" >&2
  exit 1
}

copy_database() {
  psql_admin "DROP DATABASE IF EXISTS \"$2\" WITH (FORCE)"
  psql_admin "CREATE DATABASE \"$2\" TEMPLATE \"$1\""
}

if [[ "${1:-}" == "snapshot" ]]; then
  stop_server
  copy_database "$POSTGRES_DB" "$SNAPSHOT_DB"
  echo "snapshot saved as $SNAPSHOT_DB"
  exit 0
fi

LABEL="${1:?usage: seeded-round.sh <label> [passes] | snapshot}"
PASSES="${2:-3}"

(cd "$REPO_ROOT" && npm run build --workspace @repo/server >/dev/null)

for pass in $(seq 1 "$PASSES"); do
  stop_server
  copy_database "$SNAPSHOT_DB" "$POSTGRES_DB"
  start_server "$LABEL"
  echo "== $LABEL pass $pass"
  EVAL_RUN_NAMESPACE="$LABEL-pass-$pass" \
    EVAL_DATASET="$(basename "$DATASET" .json)" \
    EVAL_OUTPUT_DIR=".temp/evals/agent/$LABEL/pass-$pass" \
    EVAL_TRIALS=1 \
    EVAL_MAX_CONCURRENCY=1 \
    uv run python -m runner.main run "$DATASET" || true
done
stop_server
