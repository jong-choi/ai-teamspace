import type { MeetingRoom } from '#server/calendar/domain/meeting-room.js';
import {
  meetingRoomInsertSchema,
  meetingRoomSelectSchema,
  meetingRoomUpdateSchema,
} from '#server/calendar/infrastructure/persistence/drizzle/schema/meeting-room.zod.js';

import type { z } from 'zod';

export function toMeetingRoomDomain(row: unknown): MeetingRoom {
  return meetingRoomSelectSchema.parse(row);
}

export function toMeetingRoomInsert(
  input: z.input<typeof meetingRoomInsertSchema>,
) {
  return meetingRoomInsertSchema.parse(input);
}

export function toMeetingRoomUpdate(
  input: z.input<typeof meetingRoomUpdateSchema>,
) {
  return meetingRoomUpdateSchema.parse(input);
}
