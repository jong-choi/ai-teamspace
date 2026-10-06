import type { MeetingRecurrenceSeries } from '@/calendar/domain/meeting-recurrence-series';
import {
  meetingRecurrenceSeriesInsertSchema,
  meetingRecurrenceSeriesSelectSchema,
  meetingRecurrenceSeriesUpdateSchema,
} from '@/calendar/infrastructure/persistence/drizzle/schema/meeting-recurrence-series.zod';

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
