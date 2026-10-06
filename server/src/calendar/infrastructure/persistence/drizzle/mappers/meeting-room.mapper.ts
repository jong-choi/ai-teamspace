import type { MeetingRoom } from '@/calendar/domain/meeting-room';
import {
  meetingRoomInsertSchema,
  meetingRoomSelectSchema,
  meetingRoomUpdateSchema,
} from '@/calendar/infrastructure/persistence/drizzle/schema/meeting-room.zod';

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
