import type { Meeting } from '@/calendar/domain/meeting';
import {
  meetingInsertSchema,
  meetingSelectSchema,
  meetingUpdateSchema,
} from '@/calendar/infrastructure/persistence/drizzle/schema/meeting.zod';

import type { z } from 'zod';

export function toMeetingDomain(row: unknown): Meeting {
  return meetingSelectSchema.parse(row);
}

export function toMeetingInsert(input: z.input<typeof meetingInsertSchema>) {
  return meetingInsertSchema.parse(input);
}

export function toMeetingUpdate(input: z.input<typeof meetingUpdateSchema>) {
  return meetingUpdateSchema.parse(input);
}
