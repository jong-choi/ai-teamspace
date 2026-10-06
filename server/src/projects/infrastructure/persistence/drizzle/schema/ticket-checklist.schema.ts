import { ticket } from '@/projects/infrastructure/persistence/drizzle/schema/ticket.schema';

import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

export const ticketChecklist = pgTable(
  'ticket_checklist',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    ticketId: uuid('ticket_id')
      .notNull()
      .references(() => ticket.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    position: integer('position').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, precision: 3 })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, precision: 3 })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('ticket_checklist_ticket_position_idx').on(
      table.ticketId,
      table.position,
      table.id,
    ),
    check(
      'ticket_checklist_position_nonnegative_check',
      sql`${table.position} >= 0`,
    ),
  ],
);
