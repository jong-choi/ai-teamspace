import { authOrganizationIdColumn } from '@/auth/infrastructure/persistence/drizzle/auth-organization-reference';
import { authUserIdColumn } from '@/auth/infrastructure/persistence/drizzle/auth-user-reference';

import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

export const curatedEditAudit = pgTable(
  'kg_edit_audit',
  {
    eventId: uuid('event_id').defaultRandom().primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => authOrganizationIdColumn, { onDelete: 'cascade' }),
    actorUserId: text('actor_user_id')
      .notNull()
      .references(() => authUserIdColumn, { onDelete: 'restrict' }),
    targetKind: text('target_kind').notNull(),
    targetId: uuid('target_id').notNull(),
    operation: text('operation').notNull(),
    targetRevision: integer('target_revision').notNull(),
    beforeDigest: text('before_digest'),
    afterDigest: text('after_digest'),
    occurredAt: timestamp('occurred_at', { withTimezone: true, precision: 3 })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    check(
      'kg_edit_audit_target_kind_check',
      sql`${table.targetKind} in ('node', 'edge')`,
    ),
    check(
      'kg_edit_audit_operation_check',
      sql`${table.operation} in ('create', 'update', 'delete')`,
    ),
    check('kg_edit_audit_revision_check', sql`${table.targetRevision} > 0`),
    index('kg_edit_audit_org_target_idx').on(
      table.organizationId,
      table.targetKind,
      table.targetId,
      table.occurredAt,
    ),
  ],
);
