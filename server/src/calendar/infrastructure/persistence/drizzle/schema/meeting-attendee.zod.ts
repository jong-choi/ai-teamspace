import { meetingAttendee } from '#server/calendar/infrastructure/persistence/drizzle/schema/meeting-attendee.schema.js';

import {
  createInsertSchema,
  createSelectSchema,
  createUpdateSchema,
} from 'drizzle-zod';

export const meetingAttendeeSelectSchema = createSelectSchema(meetingAttendee);
export const meetingAttendeeInsertSchema = createInsertSchema(meetingAttendee);
export const meetingAttendeeUpdateSchema =
  createUpdateSchema(meetingAttendee).partial();
