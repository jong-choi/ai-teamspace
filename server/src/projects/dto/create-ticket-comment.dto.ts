import { createZodDto } from '#server/common/dto/create-zod-dto.js';
import { ticketCommentInsertSchema } from '#server/projects/infrastructure/persistence/drizzle/schema/ticket-comment.zod.js';

import { z } from 'zod';

export const CreateTicketCommentSchema = ticketCommentInsertSchema
  .pick({ contentMarkdown: true })
  .meta({ id: 'CreateTicketComment' });

export type CreateTicketCommentInput = z.infer<
  typeof CreateTicketCommentSchema
>;

export class CreateTicketCommentDto extends createZodDto(
  CreateTicketCommentSchema,
) {}
