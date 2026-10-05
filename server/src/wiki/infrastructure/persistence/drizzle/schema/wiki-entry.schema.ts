import { authOrganizationIdColumn } from '#server/auth/infrastructure/persistence/drizzle/auth-organization-reference.js';
import { authUserIdColumn } from '#server/auth/infrastructure/persistence/drizzle/auth-user-reference.js';

import {
  foreignKey,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

export const wikiEntryKindEnum = pgEnum('wiki_entry_kind', [
  'folder',
  'document',
]);

export const wikiEntry = pgTable(
  'wiki_entry',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => authOrganizationIdColumn, { onDelete: 'cascade' }),
    parentFolderId: uuid('parent_folder_id'),
    kind: wikiEntryKindEnum('kind').notNull(),
    name: text('name').notNull(),
    position: integer('position').default(0).notNull(),
    createdByUserId: text('created_by_user_id')
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
    unique('wiki_entry_id_organization_unique').on(
      table.id,
      table.organizationId,
    ),
    unique('wiki_entry_organization_parent_name_unique')
      .on(table.organizationId, table.parentFolderId, table.name)
      .nullsNotDistinct(),
    foreignKey({
      name: 'wiki_entry_parent_organization_fk',
      columns: [table.parentFolderId, table.organizationId],
      foreignColumns: [table.id, table.organizationId],
    }).onDelete('restrict'),
    index('wiki_entry_organization_parent_position_idx').on(
      table.organizationId,
      table.parentFolderId,
      table.position,
      table.id,
    ),
    index('wiki_entry_parent_folder_idx').on(table.parentFolderId),
    index('wiki_entry_created_by_user_idx').on(table.createdByUserId),
  ],
);
