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

With `EVAL_TARGET_ADAPTER=public-http`, `run` requires a dedicated ephemeral target. It performs unauthenticated Agent Protocol `GET /info` capability capture, creates an isolated full-scope manifest actor through public Better Auth/product APIs, issues a short-lived public MCP access key, verifies MCP `2026-07-28`, captures the live tool manifest hash, revokes the probe key, and then runs bounded case/trial jobs through public Agent Protocol sessions. Per-case MCP credentials and sessions are isolated; active access keys are revoked during fixture cleanup.

With `EVAL_TARGET_ADAPTER=deterministic-fixture`, the same CLI, suite runner, case runner, deterministic scorer, report writer, and baseline diff execute without network or provider credentials. The adapter materializes dataset-declared preconditions and expected tool/argument/HITL/auth-denial behavior as an in-memory oracle. Its manifest uses a distinct fixture runtime/model identity, so fixture reports cannot be compared to a live public target as an apples-to-apples baseline. Langfuse linkage and judge credentials are rejected in this mode.

Reports are written as redacted `report.json` and `report.md` under `EVAL_OUTPUT_DIR`. Repeated trials include per-case pass rates, pass-at-least-one/pass-all flags, flaky case ids, latency mean/median/p95, estimated cost total, and tool-call counts. The console only prints aggregate counts and report paths. The harness never falls back to a production/shared target.

When `--baseline-report` is supplied, the prior machine report is loaded and compared only when dataset/version, tool manifest, Agent/MCP protocol, model/prompt, evaluator, personas, trial count, random seed, and concrete trial set are compatible. Incompatible baselines produce no synthetic deltas and make the CLI exit with status 2; comparable reports record pass-rate, failure-count, tool-count, latency/cost, newly-failing, and resolved-trial deltas. Baseline promotion remains a review action, never an automatic overwrite.

The current live CLI is deterministic-gate first. If `EVAL_JUDGE_*` settings are configured without a reviewed judge adapter, the run fails closed instead of silently skipping the judge.

## Security dataset

`datasets/security/security.json` contains deterministic authorization cases for an expired/invalid Agent session, read-only write attempts, restricted MCP policy writes, and a user with no active organization. The `expected_execution=auth_denied` contract only accepts typed Agent Protocol 401/403 failures; expected denial still runs public outcome observation and forbidden-tool assertions, while an unexpected successful execution becomes a `security_failure`. Live preflight also proves that a mutated MCP access key and the same key after public revocation both return a 401 resource-server discovery challenge.

## CI

`.github/workflows/agent-evals.yml` runs the credential-free harness contract gate on relevant pull requests: frozen sync, lock check, the full test suite, Ruff, strict Pyright, tracked dataset validation, and the loopback settings contract. It then runs both tracked smoke and security datasets through the actual `runner.main run` CLI with `EVAL_TARGET_ADAPTER=deterministic-fixture` and uploads their redacted reports as `agent-eval-pr-fast-report`. Pull-request jobs never receive provider or Langfuse secrets.

Scheduled nightly and manually dispatched nightly/release jobs force `EVAL_TARGET_ADAPTER=public-http` and remain black-box live tiers against a pre-provisioned ephemeral server. Scheduled live execution is skipped until `AGENT_EVAL_SERVER_URL` is configured. The live job uses the following repository variables: `AGENT_EVAL_SERVER_URL`, `AGENT_EVAL_MCP_RESOURCE_URL`, `AGENT_EVAL_TRUSTED_ORIGIN`, `AGENT_EVAL_EPHEMERAL_TARGET_ORIGIN`, and optional dataset/Langfuse variables. The only workflow secret consumed by the harness is optional `AGENT_EVAL_LANGFUSE_SECRET_KEY`.

Nightly uploads the redacted `report.json` and `report.md` as the fixed `agent-eval-report` artifact. A release dispatch requires `baseline_run_id`; it downloads that reviewed prior run's artifact and invokes `--baseline-report`. The workflow does not promote or overwrite a baseline automatically. PR-fast fixture results prove harness/dataset/scorer/report behavior only; live nightly/release remains authoritative for the Nest Agent Protocol, MCP authorization, configured model, HITL runtime, and Langfuse linkage boundaries.
