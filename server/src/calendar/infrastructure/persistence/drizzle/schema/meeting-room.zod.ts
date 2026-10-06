import { meetingRoom } from '@/calendar/infrastructure/persistence/drizzle/schema/meeting-room.schema';

import {
  createInsertSchema,
  createSelectSchema,
  createUpdateSchema,
} from 'drizzle-zod';
import { z } from 'zod';

const postgresIntegerMax = 2_147_483_647;

const fieldRefinements = {
  name: z.string().trim().min(1),
  capacity: z.number().int().positive().max(postgresIntegerMax),
  floor: z.string().trim().min(1).nullable(),
  description: z.string().trim().min(1).nullable(),
};

export const meetingRoomSelectSchema = createSelectSchema(
  meetingRoom,
  fieldRefinements,
);
export const meetingRoomInsertSchema = createInsertSchema(
  meetingRoom,
  fieldRefinements,
);
export const meetingRoomUpdateSchema = createUpdateSchema(
  meetingRoom,
  fieldRefinements,
).partial();
