import { authUserIdColumn } from '#server/auth/infrastructure/persistence/drizzle/auth-user-reference.js';
import { wikiEntry } from '#server/wiki/infrastructure/persistence/drizzle/schema/wiki-entry.schema.js';

import { integer, pgTable, text, uuid } from 'drizzle-orm/pg-core';

export const wikiDocument = pgTable('wiki_document', {
  id: uuid('id')
    .primaryKey()
    .references(() => wikiEntry.id, { onDelete: 'cascade' }),
  contentMarkdown: text('content_markdown').default('').notNull(),
  revision: integer('revision').default(1).notNull(),
  updatedByUserId: text('updated_by_user_id')
    .notNull()
    .references(() => authUserIdColumn, { onDelete: 'restrict' }),
});
