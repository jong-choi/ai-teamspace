import { authOrganizationIdColumn } from '#server/auth/infrastructure/persistence/drizzle/auth-organization-reference.js';

import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

export const recurrenceWeekdayValues = [
  'MO',
  'TU',
  'WE',
  'TH',
  'FR',
  'SA',
  'SU',
] as const;

export type RecurrenceWeekday = (typeof recurrenceWeekdayValues)[number];

export const meetingRecurrenceFrequencyEnum = pgEnum(
  'meeting_recurrence_frequency',
  ['daily', 'weekly', 'monthly'],
);

export const meetingRecurrenceSeries = pgTable(
  'meeting_recurrence_series',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => authOrganizationIdColumn, { onDelete: 'cascade' }),
    frequency: meetingRecurrenceFrequencyEnum('frequency').notNull(),
    interval: integer('interval').default(1).notNull(),
    count: integer('count'),
    until: timestamp('until', { withTimezone: true, precision: 3 }),
    byWeekday: jsonb('by_weekday')
      .$type<RecurrenceWeekday[]>()
      .default(sql`'[]'::jsonb`)
      .notNull(),
    timeZone: text('time_zone').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, precision: 3 })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, precision: 3 })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique('meeting_recurrence_series_id_organization_unique').on(
      table.id,
      table.organizationId,
    ),
    check('meeting_recurrence_interval_check', sql`${table.interval} > 0`),
    check(
      'meeting_recurrence_count_check',
      sql`${table.count} is null or ${table.count} >= 2`,
    ),
    check(
      'meeting_recurrence_end_check',
      sql`(${table.count} is not null and ${table.until} is null) or (${table.count} is null and ${table.until} is not null)`,
    ),
    index('meeting_recurrence_series_organization_idx').on(
      table.organizationId,
      table.id,
    ),
  ],
);
