import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

export const outboxAggregateVersion = pgTable(
  'outbox_aggregate_version',
  {
    organizationId: text('organization_id').notNull(),
    aggregateKind: text('aggregate_kind', {
      enum: [
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
      ],
    }).notNull(),
    aggregateId: text('aggregate_id').notNull(),
    desiredSeq: bigint('desired_seq', { mode: 'number' }).default(0).notNull(),
    deleted: boolean('deleted').default(false).notNull(),
    appliedSeq: bigint('applied_seq', { mode: 'number' }).default(0).notNull(),
    projectionStatus: text('projection_status').default('pending').notNull(),
    lastAttemptedAt: timestamp('last_attempted_at', {
      withTimezone: true,
      precision: 3,
    }),
    appliedAt: timestamp('applied_at', { withTimezone: true, precision: 3 }),
    lastError: text('last_error'),
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
      sql`${table.projectionStatus} in ('pending', 'applying', 'applied', 'retry_scheduled', 'failed')`,
    ),
    check(
      'outbox_aggregate_version_applied_seq_check',
      sql`${table.appliedSeq} <= ${table.desiredSeq}`,
    ),
  ],
);
