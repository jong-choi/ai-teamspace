import { meetingAttendeeSelectSchema } from '@/calendar/infrastructure/persistence/drizzle/schema/meeting-attendee.zod';

import { z } from 'zod';

export const MeetingAttendeeSchema = meetingAttendeeSelectSchema.meta({
  id: 'MeetingAttendeeDomain',
});

export type MeetingAttendee = z.infer<typeof MeetingAttendeeSchema>;
