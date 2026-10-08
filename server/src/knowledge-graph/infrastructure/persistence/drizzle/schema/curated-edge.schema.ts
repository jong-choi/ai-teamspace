import { authOrganizationIdColumn } from '@/auth/infrastructure/persistence/drizzle/auth-organization-reference';
import { authUserIdColumn } from '@/auth/infrastructure/persistence/drizzle/auth-user-reference';
import { CuratedGraphPropertiesSchema } from '@/knowledge-graph/domain/curated-graph-properties';
import { curatedNode } from '@/knowledge-graph/infrastructure/persistence/drizzle/schema/curated-node.schema';

import { inArray, sql } from 'drizzle-orm';
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

const curatedEdgePredicates = [
  'related_to',
  'depends_on',
  'contains',
  'references',
] as const;
const curatedEdgeStatuses = ['active', 'deleted'] as const;
const curatedEndpointKinds = [
  'curated_node',
  'wiki_document',
  'project',
  'ticket',
  'meeting',
] as const;

export const curatedEdge = pgTable(
  'kg_curated_edge',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => authOrganizationIdColumn, { onDelete: 'cascade' }),
    sourceNodeId: uuid('source_node_id').notNull(),
    targetNodeId: uuid('target_node_id').notNull(),
    sourceNodeKind: text('source_node_kind', { enum: curatedEndpointKinds })
      .default('curated_node')
      .notNull(),
    targetNodeKind: text('target_node_kind', { enum: curatedEndpointKinds })
      .default('curated_node')
      .notNull(),
    sourceCuratedNodeId: uuid('source_curated_node_id').generatedAlwaysAs(
      sql`case when source_node_kind = 'curated_node' then source_node_id else null end`,
    ),
    targetCuratedNodeId: uuid('target_curated_node_id').generatedAlwaysAs(
      sql`case when target_node_kind = 'curated_node' then target_node_id else null end`,
    ),
    predicate: text('predicate', { enum: curatedEdgePredicates }).notNull(),
    directed: boolean('directed').default(true).notNull(),
    properties: jsonb('properties')
      .$type<z.infer<typeof CuratedGraphPropertiesSchema>>()
      .default(sql`'{}'::jsonb`)
      .notNull(),
    status: text('status', { enum: curatedEdgeStatuses })
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
    foreignKey({
      name: 'kg_curated_edge_source_organization_fk',
      columns: [table.sourceCuratedNodeId, table.organizationId],
      foreignColumns: [curatedNode.id, curatedNode.organizationId],
    }).onDelete('restrict'),
    foreignKey({
      name: 'kg_curated_edge_target_organization_fk',
      columns: [table.targetCuratedNodeId, table.organizationId],
      foreignColumns: [curatedNode.id, curatedNode.organizationId],
    }).onDelete('restrict'),
    check(
      'kg_curated_edge_predicate_check',
      inArray(table.predicate, [...curatedEdgePredicates]).inlineParams(),
    ),
    check(
      'kg_curated_edge_source_kind_check',
      inArray(table.sourceNodeKind, [...curatedEndpointKinds]).inlineParams(),
    ),
    check(
      'kg_curated_edge_target_kind_check',
      inArray(table.targetNodeKind, [...curatedEndpointKinds]).inlineParams(),
    ),
    check(
      'kg_curated_edge_endpoint_policy_check',
      sql`${table.predicate} = 'references' or (${table.sourceNodeKind} = 'curated_node' and ${table.targetNodeKind} = 'curated_node')`,
    ),
    check(
      'kg_curated_edge_direction_check',
      sql`${table.predicate} = 'related_to' or ${table.directed} = true`,
    ),
    check('kg_curated_edge_revision_check', sql`${table.revision} > 0`),
    check(
      'kg_curated_edge_status_check',
      inArray(table.status, [...curatedEdgeStatuses]).inlineParams(),
    ),
    check(
      'kg_curated_edge_delete_state_check',
      sql`(${table.status} = 'active' and ${table.deletedAt} is null) or (${table.status} = 'deleted' and ${table.deletedAt} is not null)`,
    ),
    check(
      'kg_curated_edge_no_self_loop_check',
      sql`${table.predicate} = 'references' or ${table.sourceNodeKind} <> ${table.targetNodeKind} or ${table.sourceNodeId} <> ${table.targetNodeId}`,
    ),
    uniqueIndex('kg_curated_edge_active_unique')
      .on(
        table.organizationId,
        table.sourceNodeKind,
        sql`(case when ${table.directed} then ${table.sourceNodeId} else least(${table.sourceNodeId}, ${table.targetNodeId}) end)`,
        table.targetNodeKind,
        sql`(case when ${table.directed} then ${table.targetNodeId} else greatest(${table.sourceNodeId}, ${table.targetNodeId}) end)`,
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
