import { meetingRoomUpdateSchema } from '#server/calendar/infrastructure/persistence/drizzle/schema/meeting-room.zod.js';
import { createZodDto } from '#server/common/dto/create-zod-dto.js';

import { z } from 'zod';

export const UpdateMeetingRoomSchema = z
  .object({
    name: meetingRoomUpdateSchema.shape.name,
    capacity: meetingRoomUpdateSchema.shape.capacity,
    floor: meetingRoomUpdateSchema.shape.floor,
    description: meetingRoomUpdateSchema.shape.description,
    active: meetingRoomUpdateSchema.shape.active,
  })
  .refine(
    (input) => Object.values(input).some((value) => value !== undefined),
    {
      message: '변경할 회의실 필드가 하나 이상 필요합니다.',
    },
  )
  .meta({ id: 'UpdateMeetingRoom' });

export type UpdateMeetingRoomInput = z.infer<typeof UpdateMeetingRoomSchema>;

export class UpdateMeetingRoomDto extends createZodDto(
  UpdateMeetingRoomSchema,
) {}
