import type { MeetingAttendee } from '#server/calendar/domain/meeting-attendee.js';
import {
  meetingAttendeeInsertSchema,
  meetingAttendeeSelectSchema,
  meetingAttendeeUpdateSchema,
} from '#server/calendar/infrastructure/persistence/drizzle/schema/meeting-attendee.zod.js';

import type { z } from 'zod';

export function toMeetingAttendeeDomain(row: unknown): MeetingAttendee {
  return meetingAttendeeSelectSchema.parse(row);
}

export function toMeetingAttendeeInsert(
  input: z.input<typeof meetingAttendeeInsertSchema>,
) {
  return meetingAttendeeInsertSchema.parse(input);
}

export function toMeetingAttendeeUpdate(
  input: z.input<typeof meetingAttendeeUpdateSchema>,
) {
  return meetingAttendeeUpdateSchema.parse(input);
}
