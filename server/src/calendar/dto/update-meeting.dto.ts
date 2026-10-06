import { meetingUpdateSchema } from '@/calendar/infrastructure/persistence/drizzle/schema/meeting.zod';
import { createZodDto } from '@/common/dto/create-zod-dto';

import { z } from 'zod';

export const UpdateMeetingSchema = z
  .object({
    title: meetingUpdateSchema.shape.title,
    category: meetingUpdateSchema.shape.category,
    projectId: meetingUpdateSchema.shape.projectId,
    reminderMinutes: meetingUpdateSchema.shape.reminderMinutes,
  })
  .refine(
    (input) => Object.values(input).some((value) => value !== undefined),
    {
      message: '변경할 회의 필드가 하나 이상 필요합니다.',
    },
  )
  .meta({ id: 'UpdateMeeting' });

export type UpdateMeetingInput = z.infer<typeof UpdateMeetingSchema>;

export class UpdateMeetingDto extends createZodDto(UpdateMeetingSchema) {}
