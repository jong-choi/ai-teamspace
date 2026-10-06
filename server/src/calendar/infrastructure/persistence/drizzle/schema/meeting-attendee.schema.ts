import { authUserIdColumn } from '@/auth/infrastructure/persistence/drizzle/auth-user-reference';
import { meeting } from '@/calendar/infrastructure/persistence/drizzle/schema/meeting.schema';

import {
  index,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

export const meetingAttendeeStatusEnum = pgEnum('meeting_attendee_status', [
  'pending',
  'accepted',
  'tentative',
  'declined',
]);

export const meetingAttendee = pgTable(
  'meeting_attendee',
  {
    meetingId: uuid('meeting_id')
      .notNull()
      .references(() => meeting.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => authUserIdColumn, { onDelete: 'restrict' }),
    status: meetingAttendeeStatusEnum('status').default('pending').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, precision: 3 })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, precision: 3 })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({
      name: 'meeting_attendee_pk',
      columns: [table.meetingId, table.userId],
    }),
    index('meeting_attendee_user_idx').on(table.userId, table.meetingId),
  ],
);
