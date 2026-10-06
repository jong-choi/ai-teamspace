import { meetingRecurrenceSeriesSelectSchema } from '@/calendar/infrastructure/persistence/drizzle/schema/meeting-recurrence-series.zod';

import { z } from 'zod';

export const MeetingRecurrenceSeriesSchema =
  meetingRecurrenceSeriesSelectSchema.meta({
    id: 'MeetingRecurrenceSeriesDomain',
  });

export type MeetingRecurrenceSeries = z.infer<
  typeof MeetingRecurrenceSeriesSchema
>;
