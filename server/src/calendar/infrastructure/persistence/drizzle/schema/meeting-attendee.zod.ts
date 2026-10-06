import { meetingAttendee } from '@/calendar/infrastructure/persistence/drizzle/schema/meeting-attendee.schema';

import {
  createInsertSchema,
  createSelectSchema,
  createUpdateSchema,
} from 'drizzle-zod';

export const meetingAttendeeSelectSchema = createSelectSchema(meetingAttendee);
export const meetingAttendeeInsertSchema = createInsertSchema(meetingAttendee);
export const meetingAttendeeUpdateSchema =
  createUpdateSchema(meetingAttendee).partial();
