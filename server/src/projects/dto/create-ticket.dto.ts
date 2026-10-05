import { createZodDto } from '#server/common/dto/create-zod-dto.js';
import { ticketInsertSchema } from '#server/projects/infrastructure/persistence/drizzle/schema/ticket.zod.js';

import { z } from 'zod';

export const CreateTicketSchema = z
  .object({
    columnId: ticketInsertSchema.shape.columnId,
    title: ticketInsertSchema.shape.title,
    descriptionMarkdown:
      ticketInsertSchema.shape.descriptionMarkdown.optional(),
    priority: ticketInsertSchema.shape.priority.optional(),
    assigneeUserId: ticketInsertSchema.shape.assigneeUserId.optional(),
    dueAt: z.string().datetime().nullable().optional(),
  })
  .meta({ id: 'CreateTicket' });

export type CreateTicketInput = z.infer<typeof CreateTicketSchema>;

export class CreateTicketDto extends createZodDto(CreateTicketSchema) {}
