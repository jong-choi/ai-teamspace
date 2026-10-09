import { MeetingProjectionSourceSchema } from '@/calendar/domain/meeting-projection-source';

import { z } from 'zod';

export const MeetingGraphSourceSchema = MeetingProjectionSourceSchema.pick({
  id: true,
  title: true,
  startAt: true,
  canceledAt: true,
  updatedAt: true,
});
export const MeetingGraphPageQuerySchema = z
  .object({
    q: z.string().trim().max(200).nullable(),
    after: z.object({ title: z.string(), id: z.uuid() }).strict().nullable(),
    // 공개 page 최대 100개와 다음 cursor 판정용 lookahead 1개를 허용한다.
    limit: z.number().int().min(1).max(101),
  })
  .strict();
export type MeetingGraphSource = z.infer<typeof MeetingGraphSourceSchema>;
export type MeetingGraphPageQuery = z.infer<typeof MeetingGraphPageQuerySchema>;
