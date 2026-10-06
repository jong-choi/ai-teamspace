import { meetingRoomInsertSchema } from '@/calendar/infrastructure/persistence/drizzle/schema/meeting-room.zod';
import { createZodDto } from '@/common/dto/create-zod-dto';

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
