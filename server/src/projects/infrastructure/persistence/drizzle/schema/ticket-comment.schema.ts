import { authUserIdColumn } from '#server/auth/infrastructure/persistence/drizzle/auth-user-reference.js';
import { ticket } from '#server/projects/infrastructure/persistence/drizzle/schema/ticket.schema.js';

import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const ticketComment = pgTable(
  'ticket_comment',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    ticketId: uuid('ticket_id')
      .notNull()
      .references(() => ticket.id, { onDelete: 'cascade' }),
    authorUserId: text('author_user_id')
      .notNull()
      .references(() => authUserIdColumn, { onDelete: 'restrict' }),
    contentMarkdown: text('content_markdown').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, precision: 3 })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, precision: 3 })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('ticket_comment_ticket_created_idx').on(
      table.ticketId,
      table.createdAt,
      table.id,
    ),
  ],
);
