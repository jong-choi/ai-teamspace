import { authUserIdColumn } from '#server/auth/infrastructure/persistence/drizzle/auth-user-reference.js';

import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

export const project = pgTable(
  'project',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: text('organization_id').notNull(),
    key: text('key').notNull(),
    name: text('name').notNull(),
    description: text('description').default('').notNull(),
    leadUserId: text('lead_user_id').references(() => authUserIdColumn, {
      onDelete: 'set null',
    }),
    createdByUserId: text('created_by_user_id')
      .notNull()
      .references(() => authUserIdColumn, { onDelete: 'restrict' }),
    nextTicketNumber: integer('next_ticket_number').default(1).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, precision: 3 })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, precision: 3 })
      .defaultNow()
      .notNull(),
    archivedAt: timestamp('archived_at', { withTimezone: true, precision: 3 }),
  },
  (table) => [
    unique('project_id_organization_unique').on(table.id, table.organizationId),
    uniqueIndex('project_organization_key_uidx').on(
      table.organizationId,
      table.key,
    ),
    index('project_organization_archived_updated_idx').on(
      table.organizationId,
      table.archivedAt,
      table.updatedAt,
    ),
    index('project_lead_user_idx').on(table.leadUserId),
    check(
      'project_next_ticket_number_positive_check',
      sql`${table.nextTicketNumber} > 0`,
    ),
  ],
);
