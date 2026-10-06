import type { MeetingRecurrenceSeries } from '#server/calendar/domain/meeting-recurrence-series.js';
import {
  meetingRecurrenceSeriesInsertSchema,
  meetingRecurrenceSeriesSelectSchema,
  meetingRecurrenceSeriesUpdateSchema,
} from '#server/calendar/infrastructure/persistence/drizzle/schema/meeting-recurrence-series.zod.js';

import type { z } from 'zod';

export function toMeetingRecurrenceSeriesDomain(
  row: unknown,
): MeetingRecurrenceSeries {
  return meetingRecurrenceSeriesSelectSchema.parse(row);
}

export function toMeetingRecurrenceSeriesInsert(
  input: z.input<typeof meetingRecurrenceSeriesInsertSchema>,
) {
  return meetingRecurrenceSeriesInsertSchema.parse(input);
}

export function toMeetingRecurrenceSeriesUpdate(
  input: z.input<typeof meetingRecurrenceSeriesUpdateSchema>,
) {
  return meetingRecurrenceSeriesUpdateSchema.parse(input);
}
