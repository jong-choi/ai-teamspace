import { createZodDto } from '@/common/dto/create-zod-dto';
import { ticketInsertSchema } from '@/projects/infrastructure/persistence/drizzle/schema/ticket.zod';

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
