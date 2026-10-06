import { meeting } from '@/calendar/infrastructure/persistence/drizzle/schema/meeting.schema';

import {
  createInsertSchema,
  createSelectSchema,
  createUpdateSchema,
} from 'drizzle-zod';
import { z } from 'zod';

const postgresIntegerMax = 2_147_483_647;

export const meetingTimeZoneSchema = z
  .string()
  .trim()
  .min(1)
  .refine((value) => {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: value }).format();
      return true;
    } catch {
      return false;
    }
  }, '유효한 IANA timezone이어야 합니다.');

const fieldRefinements = {
  projectId: z.string().trim().min(1).nullable(),
  title: z.string().trim().min(1),
  timeZone: meetingTimeZoneSchema,
  locationText: z.string().trim().min(1).nullable(),
  agendaMarkdown: z.string(),
  notesMarkdown: z.string(),
  reminderMinutes: z.number().int().min(0).max(postgresIntegerMax).nullable(),
  iCalSequence: z.number().int().min(0).max(postgresIntegerMax),
  cancelReason: z.string().trim().min(1).max(1_000).nullable(),
};

export const meetingSelectSchema = createSelectSchema(
  meeting,
  fieldRefinements,
);
export const meetingInsertSchema = createInsertSchema(
  meeting,
  fieldRefinements,
);
export const meetingUpdateSchema = createUpdateSchema(
  meeting,
  fieldRefinements,
).partial();
