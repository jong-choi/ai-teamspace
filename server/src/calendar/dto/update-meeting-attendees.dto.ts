import { createZodDto } from '#server/common/dto/create-zod-dto.js';

import { z } from 'zod';

export const UpdateMeetingAttendeesSchema = z
  .object({
    attendeeUserIds: z.array(z.string().trim().min(1)).max(500),
  })
  .meta({ id: 'UpdateMeetingAttendees' });

export type UpdateMeetingAttendeesInput = z.infer<
  typeof UpdateMeetingAttendeesSchema
>;

export class UpdateMeetingAttendeesDto extends createZodDto(
  UpdateMeetingAttendeesSchema,
) {}
