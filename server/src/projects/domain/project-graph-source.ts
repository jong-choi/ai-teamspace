import { ProjectProjectionSourceSchema } from '@/projects/domain/project-projection-source';
import { TicketProjectionSourceSchema } from '@/projects/domain/ticket-projection-source';

import { z } from 'zod';

export const ProjectGraphSourceSchema = ProjectProjectionSourceSchema.pick({
  id: true,
  name: true,
  archivedAt: true,
  updatedAt: true,
});
export const TicketGraphSourceSchema = TicketProjectionSourceSchema.pick({
  id: true,
  projectId: true,
  title: true,
  archivedAt: true,
  updatedAt: true,
});
export const ProjectGraphPageQuerySchema = z
  .object({
    q: z.string().trim().max(200).nullable(),
    after: z.object({ title: z.string(), id: z.uuid() }).strict().nullable(),
    // 공개 page 최대 100개와 다음 cursor 판정용 lookahead 1개를 허용한다.
    limit: z.number().int().min(1).max(101),
  })
  .strict();
export type ProjectGraphSource = z.infer<typeof ProjectGraphSourceSchema>;
export type TicketGraphSource = z.infer<typeof TicketGraphSourceSchema>;
export type ProjectGraphPageQuery = z.infer<typeof ProjectGraphPageQuerySchema>;
