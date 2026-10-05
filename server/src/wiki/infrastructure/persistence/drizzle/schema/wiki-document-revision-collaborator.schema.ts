import { authUserIdColumn } from '#server/auth/infrastructure/persistence/drizzle/auth-user-reference.js';
import { wikiDocumentRevision } from '#server/wiki/infrastructure/persistence/drizzle/schema/wiki-document-revision.schema.js';

import {
  foreignKey,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  uuid,
} from 'drizzle-orm/pg-core';

export const wikiDocumentRevisionCollaborator = pgTable(
  'wiki_document_revision_collaborator',
  {
    documentId: uuid('document_id').notNull(),
    revision: integer('revision').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => authUserIdColumn, { onDelete: 'restrict' }),
    ordinal: integer('ordinal').notNull(),
  },
  (table) => [
    primaryKey({
      name: 'wiki_document_revision_collaborator_pk',
      columns: [table.documentId, table.revision, table.userId],
    }),
    foreignKey({
      name: 'wiki_document_revision_collaborator_revision_fk',
      columns: [table.documentId, table.revision],
      foreignColumns: [
        wikiDocumentRevision.documentId,
        wikiDocumentRevision.revision,
      ],
    }).onDelete('cascade'),
    index('wiki_document_revision_collaborator_order_idx').on(
      table.documentId,
      table.revision,
      table.ordinal,
    ),
    index('wiki_document_revision_collaborator_user_idx').on(table.userId),
  ],
);
