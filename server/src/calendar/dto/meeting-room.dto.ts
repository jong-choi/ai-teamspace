import type { MeetingRoom } from '#server/calendar/domain/meeting-room.js';
import { MeetingRoomSchema as MeetingRoomDomainSchema } from '#server/calendar/domain/meeting-room.js';
import { createZodDto } from '#server/common/dto/create-zod-dto.js';

import { z } from 'zod';

export const MeetingRoomSchema = MeetingRoomDomainSchema.omit({
  createdAt: true,
  updatedAt: true,
})
  .extend({
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .meta({ id: 'MeetingRoom' });

export const MeetingRoomListSchema = z
  .object({ items: z.array(MeetingRoomSchema) })
  .meta({ id: 'MeetingRoomList' });

export type MeetingRoomResponse = z.infer<typeof MeetingRoomSchema>;
export type MeetingRoomListResponse = z.infer<typeof MeetingRoomListSchema>;

export function toMeetingRoomResponse(room: MeetingRoom): MeetingRoomResponse {
  return MeetingRoomSchema.parse({
    ...room,
    createdAt: room.createdAt.toISOString(),
    updatedAt: room.updatedAt.toISOString(),
  });
}

export class MeetingRoomDto extends createZodDto(MeetingRoomSchema) {}
export class MeetingRoomListDto extends createZodDto(MeetingRoomListSchema) {}
