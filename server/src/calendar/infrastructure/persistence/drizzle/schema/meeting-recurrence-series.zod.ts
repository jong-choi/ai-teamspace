import {
  meetingRecurrenceSeries,
  recurrenceWeekdayValues,
} from '@/calendar/infrastructure/persistence/drizzle/schema/meeting-recurrence-series.schema';

import {
  createInsertSchema,
  createSelectSchema,
  createUpdateSchema,
} from 'drizzle-zod';
import { z } from 'zod';

export const recurrenceWeekdaySchema = z.enum(recurrenceWeekdayValues);

export const recurrenceTimeZoneSchema = z
  .string()
  .trim()
  .min(1)
  .refine((value) => {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: value }).format();
      return true;
    } catch {
      return false;
    }
  }, '유효한 IANA timezone이어야 합니다.');

const fieldRefinements = {
  interval: z.number().int().positive(),
  count: z.number().int().min(2).nullable(),
  byWeekday: z.array(recurrenceWeekdaySchema).max(7),
  timeZone: recurrenceTimeZoneSchema,
};

export const meetingRecurrenceSeriesSelectSchema = createSelectSchema(
  meetingRecurrenceSeries,
  fieldRefinements,
);
export const meetingRecurrenceSeriesInsertSchema = createInsertSchema(
  meetingRecurrenceSeries,
  fieldRefinements,
);
export const meetingRecurrenceSeriesUpdateSchema = createUpdateSchema(
  meetingRecurrenceSeries,
  fieldRefinements,
).partial();
