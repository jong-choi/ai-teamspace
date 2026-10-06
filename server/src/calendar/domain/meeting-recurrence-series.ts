import { meetingRecurrenceSeriesSelectSchema } from '#server/calendar/infrastructure/persistence/drizzle/schema/meeting-recurrence-series.zod.js';

import { z } from 'zod';

export const MeetingRecurrenceSeriesSchema =
  meetingRecurrenceSeriesSelectSchema.meta({
    id: 'MeetingRecurrenceSeriesDomain',
  });

export type MeetingRecurrenceSeries = z.infer<
  typeof MeetingRecurrenceSeriesSchema
>;
