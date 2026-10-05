import { wikiBytea } from '#server/wiki/infrastructure/persistence/drizzle/schema/wiki-bytea.js';

import {
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

export const legacyWikiEntryKind = pgEnum('wiki_entry_kind', [
  'folder',
  'document',
]);

export const legacyWikiEntry = pgTable('wiki_entry', {
  id: uuid('id').primaryKey(),
  organizationId: text('organization_id').notNull(),
  parentFolderId: uuid('parent_folder_id'),
  kind: legacyWikiEntryKind('kind').notNull(),
  name: text('name').notNull(),
  position: integer('position').notNull(),
  createdByUserId: text('created_by_user_id').notNull(),
  createdAt: timestamp('created_at', {
    withTimezone: true,
    precision: 3,
  }).notNull(),
  updatedAt: timestamp('updated_at', {
    withTimezone: true,
    precision: 3,
  }).notNull(),
});

export const cutoverWikiDocument = pgTable('wiki_document', {
  id: uuid('id').primaryKey(),
  collectionId: uuid('collection_id'),
  organizationId: text('organization_id'),
  parentDocumentId: uuid('parent_document_id'),
  title: text('title'),
  position: integer('position'),
  contentMarkdown: text('content_markdown').notNull(),
  collaborationState: wikiBytea('collaboration_state'),
  collaborationSchemaVersion: integer('collaboration_schema_version'),
  collaborationPersistedAt: timestamp('collaboration_persisted_at', {
    withTimezone: true,
    precision: 3,
  }),
  revision: integer('revision').notNull(),
  createdByUserId: text('created_by_user_id'),
  updatedByUserId: text('updated_by_user_id').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, precision: 3 }),
  updatedAt: timestamp('updated_at', { withTimezone: true, precision: 3 }),
});
