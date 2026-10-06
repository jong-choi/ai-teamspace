// @repo/agent-runtime/storage-postgres — Postgres SkeinStore driver with pgvector semantic search.
// Graph checkpoints stay LangGraph-native via PostgresSaver (not part of this store).
// See docs/storage.md and docs/testing.md.

export {
  createPostgresPool,
  type EmbedFunction,
  type PostgresPoolOptions,
  PostgresSkeinStore,
  type PostgresSkeinStoreOptions,
  type StoreIndexConfig,
} from '#agent-runtime/storage-postgres/postgres-skein-store.js';
export {
  CHECKPOINTER_MIGRATIONS_LOCK,
  withSessionAdvisoryLock,
  type WithSessionAdvisoryLockOptions,
} from '#agent-runtime/storage-postgres/run-migrations.js';
export {
  createPostgresThreadExecutionGate,
  threadLockKey,
} from '#agent-runtime/storage-postgres/thread-execution-gate.js';
