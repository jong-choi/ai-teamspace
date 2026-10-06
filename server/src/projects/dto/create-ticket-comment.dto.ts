import { createZodDto } from '@/common/dto/create-zod-dto';
import { ticketCommentInsertSchema } from '@/projects/infrastructure/persistence/drizzle/schema/ticket-comment.zod';

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
