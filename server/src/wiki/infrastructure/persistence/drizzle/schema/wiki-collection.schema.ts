import { authOrganizationIdColumn } from '#server/auth/infrastructure/persistence/drizzle/auth-organization-reference.js';

import { pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';

export const wikiCollection = pgTable(
  'wiki_collection',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => authOrganizationIdColumn, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true, precision: 3 })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, precision: 3 })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique('wiki_collection_organization_unique').on(table.organizationId),
    unique('wiki_collection_id_organization_unique').on(
      table.id,
      table.organizationId,
    ),
  ],
);
