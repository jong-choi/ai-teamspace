import { meetingAttendeeInsertSchema } from '@/calendar/infrastructure/persistence/drizzle/schema/meeting-attendee.zod';
import { createZodDto } from '@/common/dto/create-zod-dto';

import { z } from 'zod';

export const UpdateMeetingAttendeesSchema = z
  .object({
    attendeeUserIds: z.array(meetingAttendeeInsertSchema.shape.userId).max(500),
  })
  .meta({ id: 'UpdateMeetingAttendees' });

export type UpdateMeetingAttendeesInput = z.infer<
  typeof UpdateMeetingAttendeesSchema
>;

export class UpdateMeetingAttendeesDto extends createZodDto(
  UpdateMeetingAttendeesSchema,
) {}
