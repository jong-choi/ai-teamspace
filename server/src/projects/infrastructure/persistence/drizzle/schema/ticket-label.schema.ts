import { project } from '@/projects/infrastructure/persistence/drizzle/schema/project.schema';

import {
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

export const ticketLabelColorEnum = pgEnum('ticket_label_color', [
  'neutral',
  'red',
  'orange',
  'amber',
  'green',
  'blue',
  'violet',
  'pink',
]);

export const ticketLabel = pgTable(
  'ticket_label',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => project.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    color: ticketLabelColorEnum('color').default('neutral').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, precision: 3 })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, precision: 3 })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('ticket_label_project_name_idx').on(
      table.projectId,
      table.name,
      table.id,
    ),
  ],
);
