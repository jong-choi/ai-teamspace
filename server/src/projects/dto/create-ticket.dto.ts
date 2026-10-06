import { createZodDto } from '#server/common/dto/create-zod-dto.js';
import { ticketInsertSchema } from '#server/projects/infrastructure/persistence/drizzle/schema/ticket.zod.js';

import { z } from 'zod';

export const CreateTicketSchema = ticketInsertSchema
  .pick({
    columnId: true,
    title: true,
    descriptionMarkdown: true,
    priority: true,
    assigneeUserId: true,
  })
  .partial({ assigneeUserId: true })
  .extend({
    dueAt: z.string().datetime().nullable().optional(),
  })
  .meta({ id: 'CreateTicket' });

export type CreateTicketInput = z.infer<typeof CreateTicketSchema>;

export class CreateTicketDto extends createZodDto(CreateTicketSchema) {}
