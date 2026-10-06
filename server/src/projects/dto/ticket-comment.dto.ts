import type { AuthUserIdentity } from '#server/auth/auth-user-directory.service.js';
import { createZodDto } from '#server/common/dto/create-zod-dto.js';
import type { TicketComment } from '#server/projects/domain/ticket-comment.js';
import {
  ProjectUserSummarySchema,
  toProjectUserSummary,
} from '#server/projects/dto/project.dto.js';
import { ticketCommentSelectSchema } from '#server/projects/infrastructure/persistence/drizzle/schema/ticket-comment.zod.js';

import { z } from 'zod';

export const TicketCommentResponseSchema = ticketCommentSelectSchema
  .pick({
    id: true,
    ticketId: true,
    contentMarkdown: true,
  })
  .extend({
    author: ProjectUserSummarySchema,
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .meta({ id: 'TicketComment' });

export const TicketCommentListSchema = z
  .object({ items: z.array(TicketCommentResponseSchema) })
  .meta({ id: 'TicketCommentList' });

export type TicketCommentResponse = z.infer<typeof TicketCommentResponseSchema>;
export type TicketCommentListResponse = z.infer<typeof TicketCommentListSchema>;

export function toTicketCommentResponse(
  comment: TicketComment,
  author: AuthUserIdentity,
): TicketCommentResponse {
  const authorSummary = toProjectUserSummary(author);
  if (!authorSummary) {
    throw new Error('티켓 댓글 작성자 projection을 만들 수 없습니다.');
  }
  return TicketCommentResponseSchema.parse({
    id: comment.id,
    ticketId: comment.ticketId,
    author: authorSummary,
    contentMarkdown: comment.contentMarkdown,
    createdAt: comment.createdAt.toISOString(),
    updatedAt: comment.updatedAt.toISOString(),
  });
}

export class TicketCommentDto extends createZodDto(
  TicketCommentResponseSchema,
) {}
export class TicketCommentListDto extends createZodDto(
  TicketCommentListSchema,
) {}
