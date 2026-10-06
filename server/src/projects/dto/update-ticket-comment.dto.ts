import { createZodDto } from '@/common/dto/create-zod-dto';
import { ticketCommentUpdateSchema } from '@/projects/infrastructure/persistence/drizzle/schema/ticket-comment.zod';

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
