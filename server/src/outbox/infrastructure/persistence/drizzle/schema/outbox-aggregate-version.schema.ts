import { inArray, sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

const aggregateKinds = [
  'wiki_document',
  'project',
  'ticket_label',
  'ticket',
  'meeting',
  'meeting_room',
  'meeting_recurrence',
  'membership',
  'curated_node',
  'curated_edge',
] as const;
const projectionStatuses = [
  'pending',
  'applying',
  'applied',
  'retry_scheduled',
  'failed',
] as const;

export const outboxAggregateVersion = pgTable(
  'outbox_aggregate_version',
  {
    organizationId: text('organization_id').notNull(),
    aggregateKind: text('aggregate_kind', {
      enum: aggregateKinds,
    }).notNull(),
    aggregateId: text('aggregate_id').notNull(),
    desiredSeq: bigint('desired_seq', { mode: 'number' }).default(0).notNull(),
    deleted: boolean('deleted').default(false).notNull(),
    appliedSeq: bigint('applied_seq', { mode: 'number' }).default(0).notNull(),
    projectionStatus: text('projection_status', { enum: projectionStatuses })
      .default('pending')
      .notNull(),
    lastAttemptedAt: timestamp('last_attempted_at', {
      withTimezone: true,
      precision: 3,
    }),
    appliedAt: timestamp('applied_at', { withTimezone: true, precision: 3 }),
    lastError: text('last_error'),
    appliedSnapshotDigest: text('applied_snapshot_digest'),
    requeueCount: integer('requeue_count').default(0).notNull(),
    lastRequeuedAt: timestamp('last_requeued_at', {
      withTimezone: true,
      precision: 3,
    }),
    updatedAt: timestamp('updated_at', { withTimezone: true, precision: 3 })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.organizationId, table.aggregateKind, table.aggregateId],
    }),
    check(
      'outbox_aggregate_version_projection_status_check',
      inArray(table.projectionStatus, [...projectionStatuses]).inlineParams(),
    ),
    check(
      'outbox_aggregate_version_applied_seq_check',
      sql`${table.appliedSeq} <= ${table.desiredSeq}`,
    ),
    check(
      'outbox_aggregate_version_kind_check',
      inArray(table.aggregateKind, [...aggregateKinds]).inlineParams(),
    ),
    check(
      'outbox_aggregate_version_safe_seq_check',
      sql`${table.appliedSeq} >= 0 and ${table.desiredSeq} >= 0 and ${table.desiredSeq} <= ${Number.MAX_SAFE_INTEGER}`.inlineParams(),
    ),
    check(
      'outbox_aggregate_version_snapshot_digest_check',
      sql`${table.appliedSnapshotDigest} is null or ${table.appliedSnapshotDigest} ~ '^[0-9a-f]{64}$'`,
    ),
    check(
      'outbox_aggregate_version_requeue_count_check',
      sql`${table.requeueCount} >= 0`,
    ),
    index('outbox_aggregate_version_pending_requeue_idx')
      .on(
        sql`(coalesce(${table.lastRequeuedAt}, 'epoch'::timestamptz))`,
        table.updatedAt,
        table.organizationId,
        table.aggregateKind,
        table.aggregateId,
      )
      .where(sql`${table.appliedSeq} < ${table.desiredSeq}`),
    index('outbox_aggregate_version_membership_observation_idx')
      .on(table.organizationId, table.aggregateId)
      .where(sql`${table.aggregateKind} = 'membership'`),
  ],
);
