import { RecurrenceScopeSchema } from '#server/calendar/dto/recurrence.dto.js';
import { meetingSelectSchema } from '#server/calendar/infrastructure/persistence/drizzle/schema/meeting.zod.js';
import { createZodDto } from '#server/common/dto/create-zod-dto.js';

import { z } from 'zod';

const instantSchema = z.string().datetime({ offset: true });

export const RescheduleMeetingSchema = z
  .object({
    startAt: instantSchema,
    endAt: instantSchema,
    timeZone: meetingSelectSchema.shape.timeZone,
    locationType: meetingSelectSchema.shape.locationType,
    meetingRoomId: meetingSelectSchema.shape.meetingRoomId,
    locationText: meetingSelectSchema.shape.locationText,
    scope: RecurrenceScopeSchema.default('single'),
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
  .meta({ id: 'RescheduleMeeting' });

export type RescheduleMeetingInput = z.infer<typeof RescheduleMeetingSchema>;

export class RescheduleMeetingDto extends createZodDto(
  RescheduleMeetingSchema,
) {}
