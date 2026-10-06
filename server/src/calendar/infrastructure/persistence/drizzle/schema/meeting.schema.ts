import { authOrganizationIdColumn } from '#server/auth/infrastructure/persistence/drizzle/auth-organization-reference.js';
import { authUserIdColumn } from '#server/auth/infrastructure/persistence/drizzle/auth-user-reference.js';
import { meetingRecurrenceSeries } from '#server/calendar/infrastructure/persistence/drizzle/schema/meeting-recurrence-series.schema.js';
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
    iCalUid: uuid('ical_uid').defaultRandom().notNull(),
    iCalSequence: integer('ical_sequence').default(0).notNull(),
    recurrenceSeriesId: uuid('recurrence_series_id'),
    recurrenceOriginalStartAt: timestamp('recurrence_original_start_at', {
      withTimezone: true,
      precision: 3,
    }),
    createdAt: timestamp('created_at', { withTimezone: true, precision: 3 })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, precision: 3 })
      .defaultNow()
      .notNull(),
    canceledAt: timestamp('canceled_at', { withTimezone: true, precision: 3 }),
    canceledByUserId: text('canceled_by_user_id').references(
      () => authUserIdColumn,
      { onDelete: 'restrict' },
    ),
    cancelReason: text('cancel_reason'),
  },
  (table) => [
    unique('meeting_id_organization_unique').on(table.id, table.organizationId),
    foreignKey({
      name: 'meeting_room_organization_fk',
      columns: [table.meetingRoomId, table.organizationId],
      foreignColumns: [meetingRoom.id, meetingRoom.organizationId],
    }).onDelete('restrict'),
    foreignKey({
      name: 'meeting_recurrence_series_organization_fk',
      columns: [table.recurrenceSeriesId, table.organizationId],
      foreignColumns: [
        meetingRecurrenceSeries.id,
        meetingRecurrenceSeries.organizationId,
      ],
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
    check('meeting_ical_sequence_check', sql`${table.iCalSequence} >= 0`),
    check(
      'meeting_recurrence_pair_check',
      sql`(${table.recurrenceSeriesId} is null and ${table.recurrenceOriginalStartAt} is null) or (${table.recurrenceSeriesId} is not null and ${table.recurrenceOriginalStartAt} is not null)`,
    ),
    check(
      'meeting_cancel_metadata_check',
      sql`(${table.canceledAt} is null and ${table.canceledByUserId} is null and ${table.cancelReason} is null) or (${table.canceledAt} is not null and ${table.canceledByUserId} is not null)`,
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
    unique('meeting_recurrence_occurrence_unique').on(
      table.recurrenceSeriesId,
      table.recurrenceOriginalStartAt,
    ),
    index('meeting_recurrence_series_start_idx').on(
      table.recurrenceSeriesId,
      table.recurrenceOriginalStartAt,
    ),
  ],
);
