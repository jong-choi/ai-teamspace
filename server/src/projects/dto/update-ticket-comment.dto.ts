import { createZodDto } from '#server/common/dto/create-zod-dto.js';
import { ticketCommentUpdateSchema } from '#server/projects/infrastructure/persistence/drizzle/schema/ticket-comment.zod.js';

import { z } from 'zod';

export const UpdateTicketCommentSchema = ticketCommentUpdateSchema
  .pick({ contentMarkdown: true })
  .required({ contentMarkdown: true })
  .meta({ id: 'UpdateTicketComment' });

export type UpdateTicketCommentInput = z.infer<
  typeof UpdateTicketCommentSchema
>;

export class UpdateTicketCommentDto extends createZodDto(
  UpdateTicketCommentSchema,
) {}
