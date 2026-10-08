import { authOrganizationIdColumn } from '@/auth/infrastructure/persistence/drizzle/auth-organization-reference';
import { authUserIdColumn } from '@/auth/infrastructure/persistence/drizzle/auth-user-reference';
import { CuratedGraphPropertiesSchema } from '@/knowledge-graph/domain/curated-graph-properties';

import { inArray, sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import type { z } from 'zod';

const curatedNodeKinds = [
  'custom',
  'concept',
  'topic',
  'technology',
  'reference',
] as const;
const curatedNodeStatuses = ['active', 'deleted'] as const;

export const curatedNode = pgTable(
  'kg_curated_node',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => authOrganizationIdColumn, { onDelete: 'cascade' }),
    kind: text('kind', { enum: curatedNodeKinds }).notNull(),
    title: text('title').notNull(),
    properties: jsonb('properties')
      .$type<z.infer<typeof CuratedGraphPropertiesSchema>>()
      .default(sql`'{}'::jsonb`)
      .notNull(),
    status: text('status', { enum: curatedNodeStatuses })
      .default('active')
      .notNull(),
    revision: integer('revision').default(1).notNull(),
    createdByUserId: text('created_by_user_id')
      .notNull()
      .references(() => authUserIdColumn, { onDelete: 'restrict' }),
    updatedByUserId: text('updated_by_user_id')
      .notNull()
      .references(() => authUserIdColumn, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true, precision: 3 })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, precision: 3 })
      .defaultNow()
      .notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true, precision: 3 }),
  },
  (table) => [
    unique('kg_curated_node_id_organization_unique').on(
      table.id,
      table.organizationId,
    ),
    check(
      'kg_curated_node_kind_check',
      inArray(table.kind, [...curatedNodeKinds]).inlineParams(),
    ),
    check(
      'kg_curated_node_status_check',
      inArray(table.status, [...curatedNodeStatuses]).inlineParams(),
    ),
    check('kg_curated_node_revision_check', sql`${table.revision} > 0`),
    check(
      'kg_curated_node_delete_state_check',
      sql`(${table.status} = 'active' and ${table.deletedAt} is null) or (${table.status} = 'deleted' and ${table.deletedAt} is not null)`,
    ),
    index('kg_curated_node_organization_status_idx').on(
      table.organizationId,
      table.status,
      table.updatedAt,
      table.id,
    ),
  ],
);
