import { authOrganizationIdColumn } from '#server/auth/infrastructure/persistence/drizzle/auth-organization-reference.js';
import { authUserIdColumn } from '#server/auth/infrastructure/persistence/drizzle/auth-user-reference.js';
import { meetingRoom } from '#server/calendar/infrastructure/persistence/drizzle/schema/meeting-room.schema.js';

import { sql } from 'drizzle-orm';
import {
  check,
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

export const meetingCategoryEnum = pgEnum('meeting_category', [
  'team',
  'sprint',
  '1on1',
  'allhands',
  'client',
]);

export const meetingLocationTypeEnum = pgEnum('meeting_location_type', [
  'online',
  'meeting_room',
  'other',
]);

export const meeting = pgTable(
  'meeting',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => authOrganizationIdColumn, { onDelete: 'cascade' }),
    projectId: text('project_id'),
    organizerUserId: text('organizer_user_id')
      .notNull()
      .references(() => authUserIdColumn, { onDelete: 'restrict' }),
    title: text('title').notNull(),
    category: meetingCategoryEnum('category').notNull(),
    startAt: timestamp('start_at', {
      withTimezone: true,
      precision: 3,
    }).notNull(),
    endAt: timestamp('end_at', { withTimezone: true, precision: 3 }).notNull(),
    timeZone: text('time_zone').notNull(),
    locationType: meetingLocationTypeEnum('location_type').notNull(),
    meetingRoomId: uuid('meeting_room_id'),
    locationText: text('location_text'),
    agendaMarkdown: text('agenda_markdown').default('').notNull(),
    notesMarkdown: text('notes_markdown').default('').notNull(),
    reminderMinutes: integer('reminder_minutes'),
    createdAt: timestamp('created_at', { withTimezone: true, precision: 3 })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, precision: 3 })
      .defaultNow()
      .notNull(),
    canceledAt: timestamp('canceled_at', { withTimezone: true, precision: 3 }),
  },
  (table) => [
    unique('meeting_id_organization_unique').on(table.id, table.organizationId),
    foreignKey({
      name: 'meeting_room_organization_fk',
      columns: [table.meetingRoomId, table.organizationId],
      foreignColumns: [meetingRoom.id, meetingRoom.organizationId],
    }).onDelete('restrict'),
    check('meeting_time_range_check', sql`${table.endAt} > ${table.startAt}`),
    check(
      'meeting_location_room_check',
      sql`(${table.locationType} = 'meeting_room' and ${table.meetingRoomId} is not null) or (${table.locationType} <> 'meeting_room' and ${table.meetingRoomId} is null)`,
    ),
    check(
      'meeting_reminder_minutes_check',
      sql`${table.reminderMinutes} is null or ${table.reminderMinutes} >= 0`,
    ),
    index('meeting_organization_time_idx').on(
      table.organizationId,
      table.startAt,
      table.endAt,
    ),
    index('meeting_organization_category_idx').on(
      table.organizationId,
      table.category,
    ),
    index('meeting_organization_project_idx').on(
      table.organizationId,
      table.projectId,
    ),
    index('meeting_organization_room_idx').on(
      table.organizationId,
      table.meetingRoomId,
    ),
    index('meeting_organizer_time_idx').on(
      table.organizerUserId,
      table.startAt,
    ),
  ],
);
