import { meetingAttendee } from '@/calendar/infrastructure/persistence/drizzle/schema/meeting-attendee.schema';

import {
  createInsertSchema,
  createSelectSchema,
  createUpdateSchema,
} from 'drizzle-zod';
import { z } from 'zod';

const fieldRefinements = {
  userId: z.string().trim().min(1),
};

export const meetingAttendeeSelectSchema = createSelectSchema(
  meetingAttendee,
  fieldRefinements,
);
export const meetingAttendeeInsertSchema = createInsertSchema(
  meetingAttendee,
  fieldRefinements,
);
export const meetingAttendeeUpdateSchema = createUpdateSchema(
  meetingAttendee,
  fieldRefinements,
).partial();
