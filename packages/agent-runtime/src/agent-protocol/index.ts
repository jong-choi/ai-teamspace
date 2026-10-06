// @repo/agent-runtime/agent-protocol — a framework-agnostic implementation of LangChain's Agent Protocol for
// LangGraph.js. The run engine, protocol handler table, and SSE mapping, driven entirely by
// injected dependencies (see `ProtocolDeps`). This is the single public surface.

// Recommended entry point: service + handlers + worker over one shared context.
export type {
  ProtocolRuntime,
  ProtocolRuntimeOptions,
} from '#agent-runtime/agent-protocol/runtime.js';
export { createProtocolRuntime } from '#agent-runtime/agent-protocol/runtime.js';

// The framework-agnostic service (embed directly), and the advanced shared-context building blocks.
export type { ProtocolContext } from '#agent-runtime/agent-protocol/context.js';
export { createContext } from '#agent-runtime/agent-protocol/context.js';
export type { ProtocolService } from '#agent-runtime/agent-protocol/service.js';
export {
  buildProtocolService,
  createProtocolService,
  createProtocolServiceFromContext,
} from '#agent-runtime/agent-protocol/service.js';

// The transport-neutral HTTP handler table an adapter mounts.
export type { ProtocolHandlerExtras } from '#agent-runtime/agent-protocol/create-handlers.js';
export { createProtocolHandlers } from '#agent-runtime/agent-protocol/create-handlers.js';
// Exported so a surface that authenticates outside the handler table — the channel pipeline — can
// authorize against the *same* row this table would have used, rather than restating the pair.
export { ROUTE_AUTHZ } from '#agent-runtime/agent-protocol/auth/route-authz.js';
// Exported for the same reason `ROUTE_AUTHZ` is: a surface that authorizes outside the handler table
// has to scope its store the way the table would, not approximate it.
export { createAuthScopedStore } from '#agent-runtime/agent-protocol/auth/auth-scoped-store.js';
export type { RouteAuthz } from '#agent-runtime/agent-protocol/auth/route-authz.js';
export type {
  ProtocolHandler,
  ProtocolHandlers,
  ProtocolRequest,
  ProtocolResponse,
} from '#agent-runtime/agent-protocol/create-handlers.js';

// The transport-neutral route table + body-fold helper every framework adapter maps onto its router,
// plus a `matchSkeinRoute` matcher for adapters that dispatch from a catch-all (NestJS, Next.js).
export type {
  DisabledRouteGroups,
  HttpMethod,
  RouteBinding,
  RouteGroup,
  RouteMatch,
  RouteMatcher,
} from '#agent-runtime/agent-protocol/http/routes.js';
export {
  copyThreadIdIntoBody,
  createRouteMatcher,
  filterSkeinRoutes,
  foldThreadId,
  matchSkeinRoute,
  skeinRoutes,
} from '#agent-runtime/agent-protocol/http/routes.js';

// The simplified serving surface: one graph mounted as a plain endpoint (`POST /invoke/:graph_id`),
// for non-chat workloads that don't need threads/assistants/runs. See docs/serving-a-single-graph.md.
export type { CronOccurrenceQuery } from '#agent-runtime/agent-protocol/crons/cron-schedule.js';
export {
  advanceCronOccurrence,
  assertValidCronSchedule,
  nextCronOccurrence,
} from '#agent-runtime/agent-protocol/crons/cron-schedule.js';
export type {
  CronScheduler,
  CronSchedulerOptions,
  CronTickSummary,
} from '#agent-runtime/agent-protocol/crons/cron-scheduler.js';
export {
  createCronScheduler,
  DEFAULT_CRON_BATCH_SIZE,
  DEFAULT_CRON_TICK_MS,
  DEFAULT_CRON_TICK_TIMEOUT_MS,
  DEFAULT_UNQUEUED_RUN_GRACE_MS,
} from '#agent-runtime/agent-protocol/crons/cron-scheduler.js';
export type {
  CreateCronInput,
  CronService,
  SearchCronsInput,
  UpdateCronInput,
} from '#agent-runtime/agent-protocol/crons/cron-service.js';
export { createCronService } from '#agent-runtime/agent-protocol/crons/cron-service.js';
export type {
  GraphInvokeHandlerName,
  GraphInvokeOptions,
} from '#agent-runtime/agent-protocol/invoke/graph-invoke.js';
export {
  createGraphInvokeHandler,
  DEFAULT_INVOKE_PREFIX,
  graphInvokeRoutes,
} from '#agent-runtime/agent-protocol/invoke/graph-invoke.js';
// Verifying a skein callback. Exported for *receivers*: this package installs with no graph runtime,
// so a service whose only relationship with skein is receiving callbacks can depend on it for this.
export {
  SIGNATURE_HEADER,
  signDelivery,
} from '#agent-runtime/agent-protocol/crypto/sign-delivery.js';
export type {
  SignatureFailure,
  VerifySignatureInput,
  VerifySignatureResult,
} from '#agent-runtime/agent-protocol/crypto/verify-delivery.js';
export {
  equalsConstantTime,
  verifySkeinSignature,
} from '#agent-runtime/agent-protocol/crypto/verify-delivery.js';

// Outbound run-completion delivery: the retry policy, and the worker that drains the outbox.
export type { AttemptDeliveryDeps } from '#agent-runtime/agent-protocol/deliveries/attempt-delivery.js';
export { attemptDelivery } from '#agent-runtime/agent-protocol/deliveries/attempt-delivery.js';
export {
  isFinalAttempt,
  nextAttemptDelayMs,
} from '#agent-runtime/agent-protocol/deliveries/backoff.js';
export type {
  DeliveryRetryConfig,
  WebhookDeliveryConfig,
} from '#agent-runtime/agent-protocol/deliveries/delivery-config.js';
export {
  DEFAULT_INITIAL_DELAY_MS,
  DEFAULT_MAX_ATTEMPTS,
  DEFAULT_MAX_PAYLOAD_BYTES,
  DEFAULT_RETAIN_HOURS,
  DELIVERY_LEASE_MARGIN_MS,
  deliveryLeaseMs,
  QUEUE_SWEEP_MARGIN_MS,
} from '#agent-runtime/agent-protocol/deliveries/delivery-config.js';
export {
  buildDeliveryPayload,
  toDeliveryBody,
} from '#agent-runtime/agent-protocol/deliveries/delivery-payload.js';
export { fetchWebhookDispatcher } from '#agent-runtime/agent-protocol/deps.js';
// A graph declaring the answer that should be sent back — see `runs/declared-reply.ts`.
export type {
  BuiltDeliveryPayload,
  TruncatedValues,
} from '#agent-runtime/agent-protocol/deliveries/delivery-payload.js';
export type { DeliveryProcessorDeps } from '#agent-runtime/agent-protocol/deliveries/delivery-processor.js';
export { processDelivery } from '#agent-runtime/agent-protocol/deliveries/delivery-processor.js';
export type { DeliveryRequest } from '#agent-runtime/agent-protocol/deliveries/delivery-request.js';
export { toDeliveryRequest } from '#agent-runtime/agent-protocol/deliveries/delivery-request.js';
export type {
  DeliveryTickSummary,
  DeliveryWorker,
  DeliveryWorkerOptions,
} from '#agent-runtime/agent-protocol/deliveries/delivery-worker.js';
export { createDeliveryWorker } from '#agent-runtime/agent-protocol/deliveries/delivery-worker.js';
export {
  idempotencyScope,
  requestFingerprint,
} from '#agent-runtime/agent-protocol/idempotency/fingerprint.js';
export type { IdempotencyConfig } from '#agent-runtime/agent-protocol/idempotency/idempotency-config.js';
export type {
  IdempotencySweeper,
  IdempotencySweeperOptions,
} from '#agent-runtime/agent-protocol/idempotency/idempotency-sweeper.js';
export { createIdempotencySweeper } from '#agent-runtime/agent-protocol/idempotency/idempotency-sweeper.js';
export type { IdempotencyOptions } from '#agent-runtime/agent-protocol/idempotency/idempotent-handlers.js';
export { createIdempotentHandlers } from '#agent-runtime/agent-protocol/idempotency/idempotent-handlers.js';
export {
  DECLARED_REPLY_KEY,
  readDeclaredReply,
  replyWith,
} from '#agent-runtime/agent-protocol/runs/declared-reply.js';
// The background run worker.
export type {
  RunWorker,
  RunWorkerOptions,
} from '#agent-runtime/agent-protocol/runs/run-worker.js';
export {
  createRunWorker,
  DEFAULT_RUN_CONCURRENCY,
  DEFAULT_SHUTDOWN_GRACE_MS,
} from '#agent-runtime/agent-protocol/runs/run-worker.js';
export type {
  ThreadTtlSweeper,
  ThreadTtlSweeperOptions,
} from '#agent-runtime/agent-protocol/threads/thread-ttl-sweeper.js';
export { createThreadTtlSweeper } from '#agent-runtime/agent-protocol/threads/thread-ttl-sweeper.js';

// The structured `meta` on the always-on failed-run log line. A console logger can recognize it and
// render a graph failure prominently; anything else just sees an object.
export type { RunFailureReport } from '#agent-runtime/agent-protocol/runs/run-failure.js';
export {
  isRunFailureReport,
  RUN_FAILURE_REPORT_KIND,
} from '#agent-runtime/agent-protocol/runs/run-failure.js';

// The injected dependency contract.
export type {
  Clock,
  CompiledGraphFactory,
  DeliveryAttempt,
  GraphResolver,
  GraphSchemas,
  Logger,
  ProtocolDeps,
  ResolvedGraph,
  WebhookDispatcher,
} from '#agent-runtime/agent-protocol/deps.js';
export { deliveryHeaders } from '#agent-runtime/agent-protocol/deps.js';

// The agent surface, named structurally so serving the protocol with a non-LangGraph runtime needs no
// cast. `CompiledGraph` satisfies `AgentGraph`, so this widens `ResolvedGraph` without breaking any
// existing resolver. `requireAgentCapability` turns a missing optional method into a handled 422
// instead of the unhandled TypeError (a bare 500) it used to be.
export { requireAgentCapability } from '#agent-runtime/agent-protocol/graphs/agent-graph.js';
// The resume/update/goto envelope, carried to the agent opaquely. A binding translates it into its
// runtime's own command type — `@repo/agent-runtime/langgraph` builds a LangGraph `Command` from it — which is
// what keeps `new Command(...)` (a *runtime* import) out of this package.
export type {
  AgentCommand,
  AgentCommandParams,
} from '#agent-runtime/agent-protocol/graphs/agent-command.js';
export {
  agentCommand,
  agentCommandPayload,
  isAgentCommand,
} from '#agent-runtime/agent-protocol/graphs/agent-command.js';
export type {
  AgentCheckpointRef,
  AgentGraph,
  AgentGraphCapability,
  AgentGraphFactory,
  AgentGraphRuntimeResources,
  AgentStateSnapshot,
  AgentStateTask,
} from '#agent-runtime/agent-protocol/graphs/agent-graph.js';
export type {
  ThreadCheckpointer,
  ThreadCheckpointListOptions,
  ThreadCheckpointRecord,
  ThreadCheckpointTuple,
} from '#agent-runtime/agent-protocol/graphs/thread-checkpointer.js';

// The telemetry contract, re-exported from @repo/agent-runtime/core so a sink author needs only this package.
export type {
  RunFinishedEvent,
  RunStartedEvent,
  RunTelemetryContext,
  RunTelemetryEvent,
  RunTrigger,
  TelemetrySink,
} from '@repo/agent-runtime/core';

// Service input/output types (useful when building an adapter or driving the service directly).
export type {
  AssistantService,
  CreateAssistantInput,
  DeleteAssistantOptions,
  DrawGraphOptions,
  SubgraphsOptions,
} from '#agent-runtime/agent-protocol/assistants/assistant-service.js';
export type {
  MetaService,
  ServerInfo,
} from '#agent-runtime/agent-protocol/meta/server-info.js';
export type {
  CancelManyQuery,
  CancelManyResult,
  CancelRunOptions,
  CompletedWaitRun,
  CreateRunInput,
  RunService,
  StartedStream,
  WaitRunResult,
} from '#agent-runtime/agent-protocol/runs/run-service.js';
export type { StoreService } from '#agent-runtime/agent-protocol/store/store-service.js';
// The two store bridges, which are exact inverses of each other:
//
// `SkeinBaseStore` wraps a skein `StoreRepo` as a LangGraph `BaseStore`, and the run engine attaches one
// to every graph run so nodes reach long-term memory via `getStore()`.
//
// `fromBaseStore` goes the other way — a LangGraph `BaseStore` (`PostgresStore`, `InMemoryStore`, your
// own) serving skein's `/store/*` surface. It re-imposes skein's filter/namespace/paging semantics in JS
// rather than forwarding them; read its header for why forwarding would be unsafe. Pair it with
// `withStoreItems` (or `ProtocolDeps.storeItems`, which calls it) to substitute only the memory repo.
export {
  defaultAdapterScanLimit,
  fromBaseStore,
  type FromBaseStoreOptions,
  supportsStoreTtl,
} from '#agent-runtime/agent-protocol/store/from-base-store.js';
export { withStoreItems } from '#agent-runtime/agent-protocol/store/with-store-items.js';
export type {
  CreateThreadInput,
  HistoryOptions,
  PatchThreadInput,
  PruneThreadsInput,
  Superstep,
  SuperstepUpdate,
  ThreadService,
} from '#agent-runtime/agent-protocol/threads/thread-service.js';
export type {
  CommandInput,
  ThreadStreamInput,
  ThreadStreamService,
} from '#agent-runtime/agent-protocol/threads/thread-stream-service.js';

// SSE helpers, for adapters that write the event stream themselves.
export {
  DEFAULT_SSE_HEARTBEAT_MS,
  encodeFrame,
  encodeTerminal,
  parseAfterSeq,
  SSE_HEADERS,
  SSE_HEARTBEAT,
  type SseOptions,
  toSseEvents,
} from '#agent-runtime/agent-protocol/sse/sse.js';
// Every adapter's SSE write loop uses this: without it a slow client is served out of the server's
// memory, unbounded and per connection. See docs/streaming.md.
export {
  type BackpressuredWritable,
  writeWithBackpressure,
} from '#agent-runtime/agent-protocol/sse/write-with-backpressure.js';
