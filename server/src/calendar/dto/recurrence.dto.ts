import {
  meetingRecurrenceSeriesSelectSchema,
  recurrenceTimeZoneSchema,
  recurrenceWeekdaySchema,
} from '@/calendar/infrastructure/persistence/drizzle/schema/meeting-recurrence-series.zod';
import { createZodDto } from '@/common/dto/create-zod-dto';

import { z } from 'zod';

const recurrenceUntilSchema = z.string().datetime({ offset: true });

export const RecurrenceRuleSchema = z
  .object({
    frequency: meetingRecurrenceSeriesSelectSchema.shape.frequency,
    interval: z.number().int().min(1).max(100).default(1),
    count: z.number().int().min(2).max(500).optional(),
    until: recurrenceUntilSchema.optional(),
    byWeekday: z.array(recurrenceWeekdaySchema).max(7).default([]),
    timeZone: recurrenceTimeZoneSchema,
  })
  .superRefine((input, context) => {
    if ((input.count === undefined) === (input.until === undefined)) {
      context.addIssue({
        code: 'custom',
        message: '반복 일정은 count 또는 until 중 하나만 지정해야 합니다.',
        path: ['count'],
      });
    }

    if (input.frequency !== 'weekly' && input.byWeekday.length > 0) {
      context.addIssue({
        code: 'custom',
        message: 'byWeekday는 weekly 반복에서만 사용할 수 있습니다.',
        path: ['byWeekday'],
      });
    }

    if (new Set(input.byWeekday).size !== input.byWeekday.length) {
      context.addIssue({
        code: 'custom',
        message: 'byWeekday에는 같은 요일을 중복 지정할 수 없습니다.',
        path: ['byWeekday'],
      });
    }
  })
  .meta({ id: 'RecurrenceRule' });

export const RecurrenceScopeSchema = z.enum(['single', 'series', 'future']);

export const MeetingRecurrenceSchema = z
  .object({
    id: z.string().uuid(),
    frequency: meetingRecurrenceSeriesSelectSchema.shape.frequency,
    interval: meetingRecurrenceSeriesSelectSchema.shape.interval,
    count: meetingRecurrenceSeriesSelectSchema.shape.count,
    until: z.string().datetime().nullable(),
    byWeekday: meetingRecurrenceSeriesSelectSchema.shape.byWeekday,
    timeZone: meetingRecurrenceSeriesSelectSchema.shape.timeZone,
  })
  .meta({ id: 'MeetingRecurrence' });

export type RecurrenceRuleInput = z.infer<typeof RecurrenceRuleSchema>;
export type RecurrenceScope = z.infer<typeof RecurrenceScopeSchema>;
export type MeetingRecurrenceResponse = z.infer<typeof MeetingRecurrenceSchema>;

export class RecurrenceRuleDto extends createZodDto(RecurrenceRuleSchema) {}
