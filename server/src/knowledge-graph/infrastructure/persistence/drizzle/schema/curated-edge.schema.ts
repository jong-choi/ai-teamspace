import { authOrganizationIdColumn } from '@/auth/infrastructure/persistence/drizzle/auth-organization-reference';
import { authUserIdColumn } from '@/auth/infrastructure/persistence/drizzle/auth-user-reference';
import { CuratedGraphPropertiesSchema } from '@/knowledge-graph/domain/curated-graph-properties';
import { curatedNode } from '@/knowledge-graph/infrastructure/persistence/drizzle/schema/curated-node.schema';

import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import type { z } from 'zod';

export const curatedEdge = pgTable(
  'kg_curated_edge',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => authOrganizationIdColumn, { onDelete: 'cascade' }),
    sourceNodeId: uuid('source_node_id').notNull(),
    targetNodeId: uuid('target_node_id').notNull(),
    predicate: text('predicate').notNull(),
    directed: boolean('directed').default(true).notNull(),
    properties: jsonb('properties')
      .$type<z.infer<typeof CuratedGraphPropertiesSchema>>()
      .default(sql`'{}'::jsonb`)
      .notNull(),
    status: text('status').default('active').notNull(),
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
    foreignKey({
      name: 'kg_curated_edge_source_organization_fk',
      columns: [table.sourceNodeId, table.organizationId],
      foreignColumns: [curatedNode.id, curatedNode.organizationId],
    }).onDelete('restrict'),
    foreignKey({
      name: 'kg_curated_edge_target_organization_fk',
      columns: [table.targetNodeId, table.organizationId],
      foreignColumns: [curatedNode.id, curatedNode.organizationId],
    }).onDelete('restrict'),
    check(
      'kg_curated_edge_predicate_check',
      sql`${table.predicate} = 'related_to'`,
    ),
    check('kg_curated_edge_revision_check', sql`${table.revision} > 0`),
    check(
      'kg_curated_edge_status_check',
      sql`${table.status} in ('active', 'deleted')`,
    ),
    check(
      'kg_curated_edge_delete_state_check',
      sql`(${table.status} = 'active' and ${table.deletedAt} is null) or (${table.status} = 'deleted' and ${table.deletedAt} is not null)`,
    ),
    check(
      'kg_curated_edge_no_self_loop_check',
      sql`${table.sourceNodeId} <> ${table.targetNodeId}`,
    ),
    uniqueIndex('kg_curated_edge_active_unique')
      .on(
        table.organizationId,
        table.sourceNodeId,
        table.targetNodeId,
        table.predicate,
        table.directed,
      )
      .where(sql`${table.deletedAt} is null`),
    index('kg_curated_edge_organization_status_idx').on(
      table.organizationId,
      table.status,
      table.updatedAt,
      table.id,
    ),
    index('kg_curated_edge_source_idx').on(
      table.organizationId,
      table.sourceNodeId,
      table.status,
    ),
    index('kg_curated_edge_target_idx').on(
      table.organizationId,
      table.targetNodeId,
      table.status,
    ),
  ],
);
