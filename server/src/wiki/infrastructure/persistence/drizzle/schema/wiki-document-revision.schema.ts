import { authUserIdColumn } from '@/auth/infrastructure/persistence/drizzle/auth-user-reference';
import { wikiDocument } from '@/wiki/infrastructure/persistence/drizzle/schema/wiki-document.schema';

import {
  foreignKey,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

export const wikiDocumentRevision = pgTable(
  'wiki_document_revision',
  {
    documentId: uuid('document_id').notNull(),
    organizationId: text('organization_id').notNull(),
    revision: integer('revision').notNull(),
    editorUserId: text('editor_user_id')
      .notNull()
      .references(() => authUserIdColumn, { onDelete: 'restrict' }),
    contentMarkdown: text('content_markdown').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, precision: 3 })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({
      name: 'wiki_document_revision_pk',
      columns: [table.documentId, table.revision],
    }),
    foreignKey({
      name: 'wiki_document_revision_document_organization_fk',
      columns: [table.documentId, table.organizationId],
      foreignColumns: [wikiDocument.id, wikiDocument.organizationId],
    }).onDelete('cascade'),
    index('wiki_document_revision_organization_document_idx').on(
      table.organizationId,
      table.documentId,
      table.revision,
    ),
    index('wiki_document_revision_editor_idx').on(table.editorUserId),
  ],
);
