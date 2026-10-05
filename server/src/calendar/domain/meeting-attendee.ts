import { meetingAttendeeSelectSchema } from '#server/calendar/infrastructure/persistence/drizzle/schema/meeting-attendee.zod.js';

import { z } from 'zod';

export const MeetingAttendeeSchema = meetingAttendeeSelectSchema.meta({
  id: 'MeetingAttendeeDomain',
});

export type MeetingAttendee = z.infer<typeof MeetingAttendeeSchema>;
