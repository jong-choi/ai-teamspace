import { authOrganizationIdColumn } from '@/auth/infrastructure/persistence/drizzle/auth-organization-reference';
import { authUserIdColumn } from '@/auth/infrastructure/persistence/drizzle/auth-user-reference';

import { inArray, sql } from 'drizzle-orm';
import {
  bigint,
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

export const graphRebuildModes = [
  'projection_repair',
  'semantic_reindex',
  'full',
] as const;
export const graphRebuildStatuses = [
  'accepted',
  'running',
  'catching_up',
  'cancel_requested',
  'succeeded',
  'failed',
  'cancelled',
] as const;
export const graphRebuildActiveStatuses = [
  'accepted',
  'running',
  'catching_up',
  'cancel_requested',
] as const;
export const graphRebuildPhases = ['projection', 'semantic'] as const;
export const graphRebuildErrorCodes = [
  'REBUILD_SOURCES_FAILED',
  'REBUILD_CATCH_UP_TIMEOUT',
  'REBUILD_REQUESTER_FORBIDDEN',
  'REBUILD_ORGANIZATION_MISSING',
  'REBUILD_INTERNAL',
] as const;

const timestampAt = (name: string) =>
  timestamp(name, { withTimezone: true, precision: 3 });

export const graphRebuildRequest = pgTable(
  'kg_graph_rebuild_request',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => authOrganizationIdColumn, { onDelete: 'cascade' }),
    requestedByUserId: text('requested_by_user_id').references(
      () => authUserIdColumn,
      { onDelete: 'set null' },
    ),
    mode: text('mode', { enum: graphRebuildModes }).notNull(),
    status: text('status', { enum: graphRebuildStatuses })
      .default('accepted')
      .notNull(),
    pipelineFingerprint: text('pipeline_fingerprint').notNull(),
    phase: text('phase', { enum: graphRebuildPhases }),
    cursorKind: text('cursor_kind'),
    cursorAfterId: text('cursor_after_id'),
    leaseToken: uuid('lease_token'),
    leaseExpiresAt: timestampAt('lease_expires_at'),
    fenceToken: bigint('fence_token', { mode: 'number' }).default(0).notNull(),
    pagesCommitted: integer('pages_committed').default(0).notNull(),
    projectionIntents: integer('projection_intents').default(0).notNull(),
    semanticRequests: integer('semantic_requests').default(0).notNull(),
    skippedDeleted: integer('skipped_deleted').default(0).notNull(),
    failedSources: integer('failed_sources'),
    lastErrorCode: text('last_error_code', { enum: graphRebuildErrorCodes }),
    acceptedAt: timestampAt('accepted_at').defaultNow().notNull(),
    startedAt: timestampAt('started_at'),
    catchUpStartedAt: timestampAt('catch_up_started_at'),
    cancelRequestedAt: timestampAt('cancel_requested_at'),
    completedAt: timestampAt('completed_at'),
    updatedAt: timestampAt('updated_at').defaultNow().notNull(),
  },
  (table) => [
    unique('kg_graph_rebuild_request_id_org_unique').on(
      table.id,
      table.organizationId,
    ),
    uniqueIndex('kg_graph_rebuild_request_active_unique')
      .on(table.organizationId)
      .where(
        inArray(table.status, [...graphRebuildActiveStatuses]).inlineParams(),
      ),
    index('kg_graph_rebuild_request_claim_idx').on(
      table.status,
      table.leaseExpiresAt,
      table.updatedAt,
    ),
    index('kg_graph_rebuild_request_org_recent_idx').on(
      table.organizationId,
      table.acceptedAt,
    ),
    check(
      'kg_graph_rebuild_request_mode_check',
      inArray(table.mode, [...graphRebuildModes]).inlineParams(),
    ),
    check(
      'kg_graph_rebuild_request_status_check',
      inArray(table.status, [...graphRebuildStatuses]).inlineParams(),
    ),
    check(
      'kg_graph_rebuild_request_phase_check',
      sql`${table.phase} is null or ${inArray(table.phase, [...graphRebuildPhases]).inlineParams()}`,
    ),
    check(
      'kg_graph_rebuild_request_lease_check',
      sql`(${table.leaseToken} is null) = (${table.leaseExpiresAt} is null)`,
    ),
    check(
      'kg_graph_rebuild_request_terminal_check',
      sql`(${table.status} in ('succeeded', 'failed', 'cancelled')) = (${table.completedAt} is not null)`,
    ),
    check(
      'kg_graph_rebuild_request_failed_code_check',
      sql`(${table.status} = 'failed') = (${table.lastErrorCode} is not null)`,
    ),
    check(
      'kg_graph_rebuild_request_cancel_check',
      sql`${table.status} not in ('cancel_requested', 'cancelled') or ${table.cancelRequestedAt} is not null`,
    ),
    check(
      'kg_graph_rebuild_request_counts_check',
      sql`${table.pagesCommitted} >= 0 and ${table.projectionIntents} >= 0 and ${table.semanticRequests} >= 0 and ${table.skippedDeleted} >= 0 and (${table.failedSources} is null or ${table.failedSources} >= 0) and ${table.fenceToken} >= 0 and ${table.fenceToken} <= 9007199254740991`,
    ),
    check(
      'kg_graph_rebuild_request_fingerprint_check',
      sql`${table.pipelineFingerprint} ~ '^[0-9a-f]{64}$'`,
    ),
  ],
);
