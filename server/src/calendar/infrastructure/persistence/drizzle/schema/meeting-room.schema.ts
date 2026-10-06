import { authOrganizationIdColumn } from '@/auth/infrastructure/persistence/drizzle/auth-organization-reference';

import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

export const meetingRoom = pgTable(
  'meeting_room',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => authOrganizationIdColumn, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    capacity: integer('capacity').notNull(),
    floor: text('floor'),
    description: text('description'),
    active: boolean('active').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, precision: 3 })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, precision: 3 })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique('meeting_room_id_organization_unique').on(
      table.id,
      table.organizationId,
    ),
    check('meeting_room_capacity_check', sql`${table.capacity} > 0`),
    index('meeting_room_organization_active_name_idx').on(
      table.organizationId,
      table.active,
      table.name,
    ),
  ],
);
