import { meetingRoom } from '#server/calendar/infrastructure/persistence/drizzle/schema/meeting-room.schema.js';

import {
  createInsertSchema,
  createSelectSchema,
  createUpdateSchema,
} from 'drizzle-zod';
import { z } from 'zod';

const fieldRefinements = {
  name: z.string().trim().min(1),
  capacity: z.number().int().positive(),
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
