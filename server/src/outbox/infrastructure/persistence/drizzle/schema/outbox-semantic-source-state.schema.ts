import { authUserIdColumn } from '@/auth/infrastructure/persistence/drizzle/auth-user-reference';
import { outboxAggregateVersion } from '@/outbox/infrastructure/persistence/drizzle/schema/outbox-aggregate-version.schema';

import { inArray, sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

export const semanticSourceKinds = ['wiki_document'] as const;
const semanticRunStatuses = [
  'idle',
  'running',
  'retry_waiting',
  'validation_failed',
  'failed',
] as const;
export const semanticErrorCodes = [
  'EXTRACTION_INVALID_RESPONSE',
  'EMBEDDING_INVALID',
  'PROVIDER_UNAUTHORIZED',
  'PROVIDER_FORBIDDEN',
  'PROVIDER_RATE_LIMITED',
  'PROVIDER_UNAVAILABLE',
  'PROVIDER_TIMEOUT',
  'GRAPH_STORE_UNAVAILABLE',
  'SEMANTIC_SOURCE_TOO_LARGE',
  'SEMANTIC_INTERNAL',
] as const;

const at = (name: string) =>
  timestamp(name, { withTimezone: true, precision: 3 });
const seq = (name: string) =>
  bigint(name, { mode: 'number' }).default(0).notNull();

export const outboxSemanticSourceState = pgTable(
  'outbox_semantic_source_state',
  {
    organizationId: text('organization_id').notNull(),
    aggregateKind: text('aggregate_kind', {
      enum: semanticSourceKinds,
    }).notNull(),
    aggregateId: text('aggregate_id').notNull(),
    observedSeq: seq('observed_seq'),
    observedAt: at('observed_at'),
    manualRequestSeq: seq('manual_request_seq'),
    manualRequestId: uuid('manual_request_id'),
    manualRequestedAt: at('manual_requested_at'),
    manualRequestedByUserId: text('manual_requested_by_user_id').references(
      () => authUserIdColumn,
      { onDelete: 'set null' },
    ),
    manualTargetSeq: seq('manual_target_seq'),
    manualDeliveredSeq: seq('manual_delivered_seq'),
    indexedSeq: seq('indexed_seq'),
    indexedManualSeq: seq('indexed_manual_seq'),
    indexedSignature: text('indexed_signature'),
    indexedSourceUpdatedAt: at('indexed_source_updated_at'),
    indexedFingerprint: text('indexed_fingerprint'),
    activeGenerationId: uuid('active_generation_id'),
    lastIndexedAt: at('last_indexed_at'),
    runStatus: text('run_status', { enum: semanticRunStatuses })
      .default('idle')
      .notNull(),
    attemptSeq: seq('attempt_seq'),
    attemptManualSeq: seq('attempt_manual_seq'),
    attemptFingerprint: text('attempt_fingerprint'),
    leaseToken: uuid('lease_token'),
    leaseExpiresAt: at('lease_expires_at'),
    fenceToken: seq('fence_token'),
    gcRequired: boolean('gc_required').default(false).notNull(),
    lastErrorCode: text('last_error_code', { enum: semanticErrorCodes }),
    retryCount: integer('retry_count').default(0).notNull(),
    requeueCount: integer('requeue_count').default(0).notNull(),
    lastRequeuedAt: at('last_requeued_at'),
    updatedAt: at('updated_at').defaultNow().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.organizationId, t.aggregateKind, t.aggregateId] }),
    foreignKey({
      name: 'outbox_semantic_source_state_version_fk',
      columns: [t.organizationId, t.aggregateKind, t.aggregateId],
      foreignColumns: [
        outboxAggregateVersion.organizationId,
        outboxAggregateVersion.aggregateKind,
        outboxAggregateVersion.aggregateId,
      ],
    }).onDelete('cascade'),
    check(
      'outbox_semantic_source_state_kind_check',
      inArray(t.aggregateKind, [...semanticSourceKinds]).inlineParams(),
    ),
    check(
      'outbox_semantic_source_state_run_status_check',
      inArray(t.runStatus, [...semanticRunStatuses]).inlineParams(),
    ),
    check(
      'outbox_semantic_source_state_error_check',
      sql`${t.lastErrorCode} is null or ${inArray(t.lastErrorCode, [...semanticErrorCodes]).inlineParams()}`,
    ),
    check(
      'outbox_semantic_source_state_manual_seq_check',
      sql`${t.indexedManualSeq} <= ${t.manualRequestSeq} and ${t.manualDeliveredSeq} <= ${t.manualRequestSeq} and ${t.attemptManualSeq} <= ${t.manualRequestSeq}`,
    ),
    check(
      'outbox_semantic_source_state_seq_range_check',
      sql.join(
        [
          t.observedSeq,
          t.manualRequestSeq,
          t.manualTargetSeq,
          t.manualDeliveredSeq,
          t.indexedSeq,
          t.indexedManualSeq,
          t.attemptSeq,
          t.attemptManualSeq,
          t.fenceToken,
        ].map((column) =>
          sql`(${column} >= 0 and ${column} <= ${Number.MAX_SAFE_INTEGER})`.inlineParams(),
        ),
        sql` and `,
      ),
    ),
    check(
      'outbox_semantic_source_state_digest_check',
      sql.join(
        [t.indexedSignature, t.indexedFingerprint, t.attemptFingerprint].map(
          (column) => sql`(${column} is null or ${column} ~ '^[0-9a-f]{64}$')`,
        ),
        sql` and `,
      ),
    ),
    check(
      'outbox_semantic_source_state_lease_check',
      sql`(${t.leaseToken} is null) = (${t.leaseExpiresAt} is null)`,
    ),
    check(
      'outbox_semantic_source_state_running_check',
      sql`(${t.runStatus} = 'running') = (${t.leaseToken} is not null)`,
    ),
    check(
      'outbox_semantic_source_state_manual_request_check',
      sql`(${t.manualRequestSeq} = 0) = (${t.manualRequestId} is null) and (${t.manualRequestSeq} = 0) = (${t.manualRequestedAt} is null)`,
    ),
    check(
      'outbox_semantic_source_state_observed_check',
      sql`(${t.observedSeq} = 0) = (${t.observedAt} is null)`,
    ),
    check(
      'outbox_semantic_source_state_counts_check',
      sql`${t.retryCount} >= 0 and ${t.requeueCount} >= 0`,
    ),
    index('outbox_semantic_source_state_requeue_idx').on(
      sql`(coalesce(${t.lastRequeuedAt}, 'epoch'::timestamptz))`,
      t.updatedAt,
      t.organizationId,
      t.aggregateKind,
      t.aggregateId,
    ),
  ],
);
