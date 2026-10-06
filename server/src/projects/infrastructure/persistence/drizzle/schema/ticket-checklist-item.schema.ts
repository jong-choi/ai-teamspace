import { ticketChecklist } from '@/projects/infrastructure/persistence/drizzle/schema/ticket-checklist.schema';

import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

export const ticketChecklistItem = pgTable(
  'ticket_checklist_item',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    checklistId: uuid('checklist_id')
      .notNull()
      .references(() => ticketChecklist.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    completed: boolean('completed').default(false).notNull(),
    position: integer('position').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, precision: 3 })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, precision: 3 })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('ticket_checklist_item_checklist_position_idx').on(
      table.checklistId,
      table.position,
      table.id,
    ),
    check(
      'ticket_checklist_item_position_nonnegative_check',
      sql`${table.position} >= 0`,
    ),
  ],
);
