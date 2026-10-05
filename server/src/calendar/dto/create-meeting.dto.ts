import { meetingInsertSchema } from '#server/calendar/infrastructure/persistence/drizzle/schema/meeting.zod.js';
import { createZodDto } from '#server/common/dto/create-zod-dto.js';

import { z } from 'zod';

const instantSchema = z.string().datetime({ offset: true });

export const CreateMeetingSchema = z
  .object({
    title: meetingInsertSchema.shape.title,
    category: meetingInsertSchema.shape.category,
    startAt: instantSchema,
    endAt: instantSchema,
    timeZone: meetingInsertSchema.shape.timeZone,
    locationType: meetingInsertSchema.shape.locationType,
    meetingRoomId: meetingInsertSchema.shape.meetingRoomId.optional(),
    locationText: meetingInsertSchema.shape.locationText.optional(),
    projectId: meetingInsertSchema.shape.projectId.optional(),
    attendeeUserIds: z.array(z.string().min(1)).default([]),
    agendaMarkdown: meetingInsertSchema.shape.agendaMarkdown.optional(),
    notesMarkdown: meetingInsertSchema.shape.notesMarkdown.optional(),
    reminderMinutes: meetingInsertSchema.shape.reminderMinutes.optional(),
  })
  .superRefine((input, context) => {
    if (new Date(input.endAt).getTime() <= new Date(input.startAt).getTime()) {
      context.addIssue({
        code: 'custom',
        message: '회의 종료 시각은 시작 시각보다 늦어야 합니다.',
        path: ['endAt'],
      });
    }

    if (input.locationType === 'meeting_room' && !input.meetingRoomId) {
      context.addIssue({
        code: 'custom',
        message: '회의실 장소에는 meetingRoomId가 필요합니다.',
        path: ['meetingRoomId'],
      });
    }

    if (input.locationType !== 'meeting_room' && input.meetingRoomId) {
      context.addIssue({
        code: 'custom',
        message: '회의실이 아닌 장소에는 meetingRoomId를 지정할 수 없습니다.',
        path: ['meetingRoomId'],
      });
    }
  })
  .meta({ id: 'CreateMeeting' });

export type CreateMeetingInput = z.infer<typeof CreateMeetingSchema>;

export class CreateMeetingDto extends createZodDto(CreateMeetingSchema) {}
