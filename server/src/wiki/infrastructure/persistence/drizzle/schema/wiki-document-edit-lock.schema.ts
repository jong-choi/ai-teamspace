import { authOrganizationIdColumn } from '#server/auth/infrastructure/persistence/drizzle/auth-organization-reference.js';
import { authUserIdColumn } from '#server/auth/infrastructure/persistence/drizzle/auth-user-reference.js';
import { wikiDocument } from '#server/wiki/infrastructure/persistence/drizzle/schema/wiki-document.schema.js';
import { wikiEntry } from '#server/wiki/infrastructure/persistence/drizzle/schema/wiki-entry.schema.js';

import {
  foreignKey,
  index,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

export const wikiDocumentEditLock = pgTable(
  'wiki_document_edit_lock',
  {
    documentId: uuid('document_id')
      .primaryKey()
      .references(() => wikiDocument.id, { onDelete: 'cascade' }),
    organizationId: text('organization_id')
      .notNull()
      .references(() => authOrganizationIdColumn, { onDelete: 'cascade' }),
    lockedByUserId: text('locked_by_user_id')
      .notNull()
      .references(() => authUserIdColumn, { onDelete: 'restrict' }),
    acquiredAt: timestamp('acquired_at', { withTimezone: true, precision: 3 })
      .defaultNow()
      .notNull(),
    expiresAt: timestamp('expires_at', {
      withTimezone: true,
      precision: 3,
    }).notNull(),
  },
  (table) => [
    foreignKey({
      name: 'wiki_document_edit_lock_entry_organization_fk',
      columns: [table.documentId, table.organizationId],
      foreignColumns: [wikiEntry.id, wikiEntry.organizationId],
    }).onDelete('cascade'),
    index('wiki_document_edit_lock_organization_expires_idx').on(
      table.organizationId,
      table.expiresAt,
    ),
    index('wiki_document_edit_lock_owner_idx').on(table.lockedByUserId),
  ],
);
