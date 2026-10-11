# Work OS Agent evaluations

In `public-http` mode this project evaluates the existing Nest server strictly through public Agent Protocol, MCP, product API, and optional Langfuse API boundaries. It must not import production server repositories or private database state. The separate `deterministic-fixture` adapter is a repository-owned PR-fast harness oracle; it never claims to validate production model/server behavior.

## Toolchain

Python 3.12 with `uv`. Core evaluator/client versions are exact-pinned in `pyproject.toml` and `uv.lock`.

## Setup

```bash
cd evals/agent
uv sync --frozen
cp .env.example .env
```

The settings layer requires explicit `EVAL_SERVER_URL`, `EVAL_MCP_RESOURCE_URL`, `EVAL_TRUSTED_ORIGIN`, `EVAL_OUTPUT_DIR`, dataset/baseline ids, and `EVAL_TARGET_ENVIRONMENT=ephemeral`. `EVAL_TARGET_ADAPTER` defaults to `public-http`; `deterministic-fixture` must be selected explicitly. The server, MCP resource, and trusted-origin settings must resolve to the same target origin; loopback aliases are treated as one local target. Any non-loopback target additionally requires `EVAL_EPHEMERAL_TARGET_ORIGIN` to repeat the exact remote origin, so a remote server cannot be selected by changing only one URL. Generated artifacts are only allowed under repository `.temp/` or outside the repository.

## Harness checks

```bash
uv run pytest
uv run ruff check .
uv run pyright
```

The deterministic scorer runs before any LLM judge. Security, authorization, HITL side effects, and public-state outcomes are canonical pass/fail assertions. DeepEval judge metrics are supplemental unless explicitly promoted after fixture validation.

## Smoke usage

```bash
uv run python -m runner.main settings
uv run python -m runner.main validate-dataset datasets/smoke/smoke.json
uv run python -m runner.main run datasets/smoke/smoke.json
uv run python -m runner.main run datasets/smoke/smoke.json \
  --baseline-report ../../.temp/evals/agent/baseline/report.json
```

With `EVAL_TARGET_ADAPTER=public-http`, `run` requires a dedicated ephemeral target. It performs unauthenticated Agent Protocol `GET /info` capability capture, creates an isolated full-scope manifest actor through public Better Auth/product APIs, issues a short-lived public MCP access key, verifies MCP `2026-07-28`, captures the live tool manifest hash, revokes the probe key, and then runs bounded case/trial jobs through public Agent Protocol sessions. Personas with a valid session and an active organization also complete the first-party Agent OAuth delegation through the public `/mcp/agent-delegation/start` → authorize → consent → callback endpoints, because the Work OS Agent calls Work OS MCP with the user's delegation. Per-case MCP credentials, delegations, and sessions are isolated; active access keys and delegations are revoked during fixture cleanup.

With `EVAL_TARGET_ADAPTER=deterministic-fixture`, the same CLI, suite runner, case runner, deterministic scorer, report writer, and baseline diff execute without network or provider credentials. The adapter materializes dataset-declared preconditions and expected tool/argument/HITL/auth-denial behavior as an in-memory oracle. Its manifest uses a distinct fixture runtime/model identity, so fixture reports cannot be compared to a live public target as an apples-to-apples baseline. Langfuse linkage and judge credentials are rejected in this mode.

Reports are written as redacted `report.json` and `report.md` under `EVAL_OUTPUT_DIR`. Repeated trials include per-case pass rates, pass-at-least-one/pass-all flags, flaky case ids, latency mean/median/p95, estimated cost total, and tool-call counts. The console only prints aggregate counts and report paths. The harness never falls back to a production/shared target.

When `--baseline-report` is supplied, the prior machine report is loaded and compared only when dataset/version, tool manifest, Agent/MCP protocol, model/prompt, evaluator, personas, trial count, random seed, and concrete trial set are compatible. Incompatible baselines produce no synthetic deltas and make the CLI exit with status 2; comparable reports record pass-rate, failure-count, tool-count, latency/cost, newly-failing, and resolved-trial deltas. Baseline promotion remains a review action, never an automatic overwrite.

The live CLI is deterministic-gate first. When `EVAL_JUDGE_PROVIDER=ollama-cloud`, `EVAL_JUDGE_MODEL`, and `EVAL_JUDGE_API_KEY` are all set, cases that pass deterministic scoring additionally run DeepEval `ArgumentCorrectnessMetric` with an Ollama Cloud judge model (`https://ollama.com`, Bearer API key). Judge metrics are supplemental and never change a trial's pass/fail. Before the judge runs, the harness replaces DeepEval's telemetry backend with a no-op and refuses to run if Confident AI credentials are configured, so nothing except the judge request leaves the machine. Any other provider value fails settings validation.

Ollama Cloud does not enforce the `format` JSON schema the way a local Ollama server does, so judge output relies on DeepEval's prompt-level JSON instructions. `tests/test_ollama_cloud_judge_fixtures.py` checks that the configured judge passes a correct-argument fixture and fails a wrong-argument fixture. It calls Ollama Cloud and is excluded from the default `pytest` run; run it explicitly with `uv run pytest -m live_judge`.

## Seeded workspace runs

`datasets/tool-calling/tool-calling.json` measures tool selection, tool arguments and recovery from tool errors against an already seeded workspace such as the demo seed in [demo](../../demo). Set `EVAL_SEEDED_EMAIL`, `EVAL_SEEDED_PASSWORD` and `EVAL_SEEDED_ORGANIZATION_SLUG` together; cases then sign in as that account and their preconditions look up seeded projects, tickets, wiki documents and meetings by name instead of creating them. Use the `seeded-owner` persona.

A case may carry `client_context` (time zone, route, route params), which is sent as `configurable.client_context` the way the product client does. In `client_context.params` and in argument assertion values, `$<kind>:<alias>` is replaced with that fixture's id for the trial.

Write cases change the workspace, so run passes through the wrapper, which restores the database to the seeded state before every pass:

```bash
./scripts/seeded-round.sh snapshot          # once, right after seeding
./scripts/seeded-round.sh <label> 3         # three passes into .temp/evals/agent/<label>/pass-<n>
uv run python scripts/summarize_round.py ../../.temp/evals/agent/<label>
```

To score a round in Langfuse, push each trial's transcript and counted scores, let the LLM-as-a-judge evaluators run, and pull the result. The evaluators and the judge model connection are described in [docs/agent-tool-tuning/langfuse-setup.md](../../docs/agent-tool-tuning/langfuse-setup.md).

```bash
uv run python scripts/langfuse_scores.py setup    # once, registers the evaluators
uv run python scripts/langfuse_scores.py push ../../.temp/evals/agent/<label>
uv run python scripts/langfuse_scores.py pull ../../.temp/evals/agent/<label>
uv run python scripts/score_report.py ../../.temp/evals/agent/<label> [../../.temp/evals/agent/<previous>]
```

Each pass writes, next to the redacted report, `tool-manifest.json` (the tool names, descriptions and input schemas offered to the model) and `raw/<case>.trial-<n>.json` (tool arguments, tool replies, token usage and the conversation). The raw files are for local review only and stay under `.temp`.

A tool reply with `status=error` counts as a tool error even though the run continues. When a write call fails and the agent proposes the same tool again, the harness repeats the approval up to two times so the recovery is observable; the trial still fails on the interrupt count.

## Security dataset

`datasets/security/security.json` contains deterministic authorization cases for an expired/invalid Agent session, read-only write attempts, restricted MCP policy writes, and a user with no active organization. The `expected_execution=auth_denied` contract only accepts typed Agent Protocol 401/403 failures; expected denial still runs public outcome observation and forbidden-tool assertions, while an unexpected successful execution becomes a `security_failure`. Live preflight also proves that a mutated MCP access key and the same key after public revocation both return a 401 resource-server discovery challenge.

## Local gates

Evaluations run on a developer machine only; GitHub Actions does not run them. Run every command from `evals/agent`. Settings are read from `evals/agent/.env`, and process environment variables override it for a single command.

Credential-free harness contract gate:

```bash
uv sync --frozen
uv lock --check
uv run pytest
uv run ruff check .
uv run pyright
uv run python -m runner.main validate-dataset datasets/smoke/smoke.json
uv run python -m runner.main validate-dataset datasets/security/security.json
uv run python -m runner.main settings
```

Deterministic fixture runs of both tracked datasets, without network or provider credentials:

```bash
EVAL_TARGET_ADAPTER=deterministic-fixture EVAL_DATASET=smoke EVAL_BASELINE=smoke-v1 \
  EVAL_OUTPUT_DIR=.temp/evals/agent/local-fixture-smoke \
  uv run python -m runner.main run datasets/smoke/smoke.json
EVAL_TARGET_ADAPTER=deterministic-fixture EVAL_DATASET=security EVAL_BASELINE=security-v1 \
  EVAL_OUTPUT_DIR=.temp/evals/agent/local-fixture-security \
  uv run python -m runner.main run datasets/security/security.json
```

Fixture results prove harness, dataset, scorer, and report behavior only. Live `public-http` runs against a local server remain authoritative for the Nest Agent Protocol, MCP authorization, configured model, HITL runtime, and Langfuse linkage boundaries. Baseline promotion remains a review action, never an automatic overwrite.

### Live runs against a local server

Live `public-http` runs target a locally started server that uses the test database. The server, MCP resource, and trusted origin must share one loopback origin, so start the built server with `BETTER_AUTH_URL` pointing at the same loopback origin as `EVAL_SERVER_URL` (process environment overrides `server/.env`):

```bash
npm run build --workspace @repo/server            # from the repository root
cd server && BETTER_AUTH_URL=http://localhost:3100 node dist/main.js
```

To link runs to Langfuse, start the local self-hosted Langfuse in [infra/langfuse](../../infra/langfuse/README.md), start the server with `LANGFUSE_ENABLED=true` and that project's keys, and set `EVAL_LANGFUSE_*` in `evals/agent/.env`. Linkage waits up to `EVAL_LANGFUSE_INGESTION_WAIT_SECONDS` (default 30) for asynchronous ingestion. Then, from `evals/agent`:

```bash
EVAL_OUTPUT_DIR=.temp/evals/agent/local-live-smoke \
  uv run python -m runner.main run datasets/smoke/smoke.json
EVAL_DATASET=security EVAL_BASELINE=security-v1 EVAL_OUTPUT_DIR=.temp/evals/agent/local-live-security \
  uv run python -m runner.main run datasets/security/security.json
```

The Agent model and the optional judge both call Ollama Cloud, so live runs need the server's Ollama Cloud key and, for the judge, `EVAL_JUDGE_*`. Reviewed baselines are kept under `.temp/evals/agent/baseline/<dataset>/report.json` (gitignored) and are copied there by hand after review; pass one with `--baseline-report ../../.temp/evals/agent/baseline/<dataset>/report.json`.
