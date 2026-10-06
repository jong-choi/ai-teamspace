import { ticket } from '#server/projects/infrastructure/persistence/drizzle/schema/ticket.schema.js';
import { ticketLabel } from '#server/projects/infrastructure/persistence/drizzle/schema/ticket-label.schema.js';

import { pgTable, primaryKey, uuid } from 'drizzle-orm/pg-core';

export const ticketLabelAssignment = pgTable(
  'ticket_label_assignment',
  {
    ticketId: uuid('ticket_id')
      .notNull()
      .references(() => ticket.id, { onDelete: 'cascade' }),
    labelId: uuid('label_id')
      .notNull()
      .references(() => ticketLabel.id, { onDelete: 'cascade' }),
  },
  (table) => [primaryKey({ columns: [table.ticketId, table.labelId] })],
);
