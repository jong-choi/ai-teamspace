import type { MeetingAttendee } from '@/calendar/domain/meeting-attendee';
import {
  meetingAttendeeInsertSchema,
  meetingAttendeeSelectSchema,
  meetingAttendeeUpdateSchema,
} from '@/calendar/infrastructure/persistence/drizzle/schema/meeting-attendee.zod';

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
