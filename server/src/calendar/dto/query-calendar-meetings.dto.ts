import { meetingSelectSchema } from '#server/calendar/infrastructure/persistence/drizzle/schema/meeting.zod.js';
import { createZodDto } from '#server/common/dto/create-zod-dto.js';

import { z } from 'zod';

const instantSchema = z.string().datetime({ offset: true });

export const QueryCalendarMeetingsSchema = z
  .object({
    from: instantSchema,
    to: instantSchema,
    category: meetingSelectSchema.shape.category.optional(),
    projectId: z.string().trim().min(1).optional(),
    attendeeUserId: z.string().trim().min(1).optional(),
    roomId: z.string().uuid().optional(),
    search: z.string().trim().min(1).max(100).optional(),
  })
  .refine(
    (input) => new Date(input.to).getTime() > new Date(input.from).getTime(),
    {
      message: '조회 종료 시각은 시작 시각보다 늦어야 합니다.',
      path: ['to'],
    },
  );

export type QueryCalendarMeetingsInput = z.infer<
  typeof QueryCalendarMeetingsSchema
>;

export class QueryCalendarMeetingsDto extends createZodDto(
  QueryCalendarMeetingsSchema,
) {}
