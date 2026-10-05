import type { Meeting } from '#server/calendar/domain/meeting.js';
import {
  meetingInsertSchema,
  meetingSelectSchema,
  meetingUpdateSchema,
} from '#server/calendar/infrastructure/persistence/drizzle/schema/meeting.zod.js';

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
