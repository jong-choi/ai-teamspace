import { createZodDto } from '#server/common/dto/create-zod-dto.js';
import { ticketUpdateSchema } from '#server/projects/infrastructure/persistence/drizzle/schema/ticket.zod.js';

import { z } from 'zod';

export const UpdateTicketSchema = ticketUpdateSchema
  .pick({
    title: true,
    descriptionMarkdown: true,
    priority: true,
    assigneeUserId: true,
  })
  .extend({
    dueAt: z.string().datetime().nullable().optional(),
    archived: z.boolean().optional(),
  })
  .refine(
    (input) =>
      input.title !== undefined ||
      input.descriptionMarkdown !== undefined ||
      input.priority !== undefined ||
      input.assigneeUserId !== undefined ||
      input.dueAt !== undefined ||
      input.archived !== undefined,
    '수정할 티켓 필드가 필요합니다.',
  )
  .meta({ id: 'UpdateTicket' });

export type UpdateTicketInput = z.infer<typeof UpdateTicketSchema>;

export class UpdateTicketDto extends createZodDto(UpdateTicketSchema) {}
