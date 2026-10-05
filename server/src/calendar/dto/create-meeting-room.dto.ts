import { meetingRoomInsertSchema } from '#server/calendar/infrastructure/persistence/drizzle/schema/meeting-room.zod.js';
import { createZodDto } from '#server/common/dto/create-zod-dto.js';

import { z } from 'zod';

export const CreateMeetingRoomSchema = z
  .object({
    name: meetingRoomInsertSchema.shape.name,
    capacity: meetingRoomInsertSchema.shape.capacity,
    floor: meetingRoomInsertSchema.shape.floor.optional(),
    description: meetingRoomInsertSchema.shape.description.optional(),
  })
  .meta({ id: 'CreateMeetingRoom' });

export type CreateMeetingRoomInput = z.infer<typeof CreateMeetingRoomSchema>;

export class CreateMeetingRoomDto extends createZodDto(
  CreateMeetingRoomSchema,
) {}
