import { authOrganizationIdColumn } from '@/auth/infrastructure/persistence/drizzle/auth-organization-reference';

import { inArray, sql } from 'drizzle-orm';
import {
  check,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

export const requestQuotaActions = [
  'wiki_refresh',
  'search_query',
  'graph_rebuild',
] as const;
export const requestQuotaSubjects = ['actor', 'organization'] as const;

export const requestQuota = pgTable(
  'kg_request_quota',
  {
    organizationId: text('organization_id')
      .notNull()
      .references(() => authOrganizationIdColumn, { onDelete: 'cascade' }),
    subjectKind: text('subject_kind', { enum: requestQuotaSubjects }).notNull(),
    subjectId: text('subject_id').notNull(),
    action: text('action', { enum: requestQuotaActions }).notNull(),
    windowStartAt: timestamp('window_start_at', {
      withTimezone: true,
      precision: 3,
    }).notNull(),
    count: integer('count').default(0).notNull(),
    updatedAt: timestamp('updated_at', {
      withTimezone: true,
      precision: 3,
    })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({
      columns: [
        table.organizationId,
        table.subjectKind,
        table.subjectId,
        table.action,
        table.windowStartAt,
      ],
    }),
    check(
      'kg_request_quota_subject_check',
      inArray(table.subjectKind, [...requestQuotaSubjects]).inlineParams(),
    ),
    check(
      'kg_request_quota_action_check',
      inArray(table.action, [...requestQuotaActions]).inlineParams(),
    ),
    check('kg_request_quota_count_check', sql`${table.count} >= 0`),
    check(
      'kg_request_quota_org_subject_check',
      sql`${table.subjectKind} <> 'organization' or ${table.subjectId} = ${table.organizationId}`,
    ),
  ],
);
