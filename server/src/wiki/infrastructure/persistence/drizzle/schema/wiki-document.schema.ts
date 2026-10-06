import { authUserIdColumn } from '@/auth/infrastructure/persistence/drizzle/auth-user-reference';
import { WIKI_COLLABORATION_SCHEMA_VERSION } from '@/wiki/domain/wiki-collaboration-version';
import { wikiBytea } from '@/wiki/infrastructure/persistence/drizzle/schema/wiki-bytea';
import { wikiCollection } from '@/wiki/infrastructure/persistence/drizzle/schema/wiki-collection.schema';

import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

export const wikiDocument = pgTable(
  'wiki_document',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    collectionId: uuid('collection_id').notNull(),
    organizationId: text('organization_id').notNull(),
    parentDocumentId: uuid('parent_document_id'),
    title: text('title').notNull(),
    position: integer('position').default(0).notNull(),
    contentMarkdown: text('content_markdown').default('').notNull(),
    collaborationState: wikiBytea('collaboration_state').notNull(),
    collaborationSchemaVersion: integer('collaboration_schema_version')
      .default(WIKI_COLLABORATION_SCHEMA_VERSION)
      .notNull(),
    collaborationPersistedAt: timestamp('collaboration_persisted_at', {
      withTimezone: true,
      precision: 3,
    }).notNull(),
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
  },
  (table) => [
    unique('wiki_document_id_collection_organization_unique').on(
      table.id,
      table.collectionId,
      table.organizationId,
    ),
    unique('wiki_document_id_organization_unique').on(
      table.id,
      table.organizationId,
    ),
    unique('wiki_document_collection_parent_title_unique')
      .on(table.collectionId, table.parentDocumentId, table.title)
      .nullsNotDistinct(),
    foreignKey({
      name: 'wiki_document_collection_organization_fk',
      columns: [table.collectionId, table.organizationId],
      foreignColumns: [wikiCollection.id, wikiCollection.organizationId],
    }).onDelete('cascade'),
    foreignKey({
      name: 'wiki_document_parent_scope_fk',
      columns: [
        table.parentDocumentId,
        table.collectionId,
        table.organizationId,
      ],
      foreignColumns: [table.id, table.collectionId, table.organizationId],
    }).onDelete('restrict'),
    check(
      'wiki_document_parent_not_self_check',
      sql`${table.parentDocumentId} is null or ${table.parentDocumentId} <> ${table.id}`,
    ),
    index('wiki_document_collection_parent_position_idx').on(
      table.collectionId,
      table.parentDocumentId,
      table.position,
      table.id,
    ),
    index('wiki_document_parent_idx').on(table.parentDocumentId),
    index('wiki_document_created_by_user_idx').on(table.createdByUserId),
    index('wiki_document_updated_by_user_idx').on(table.updatedByUserId),
  ],
);
