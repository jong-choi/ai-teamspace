import { meetingUpdateSchema } from '#server/calendar/infrastructure/persistence/drizzle/schema/meeting.zod.js';
import { createZodDto } from '#server/common/dto/create-zod-dto.js';

import { z } from 'zod';

export const UpdateMeetingSchema = z
  .object({
    title: meetingUpdateSchema.shape.title,
    category: meetingUpdateSchema.shape.category,
    locationType: meetingUpdateSchema.shape.locationType,
    meetingRoomId: meetingUpdateSchema.shape.meetingRoomId,
    locationText: meetingUpdateSchema.shape.locationText,
    projectId: meetingUpdateSchema.shape.projectId,
    attendeeUserIds: z.array(z.string().min(1)).optional(),
    agendaMarkdown: meetingUpdateSchema.shape.agendaMarkdown,
    notesMarkdown: meetingUpdateSchema.shape.notesMarkdown,
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
