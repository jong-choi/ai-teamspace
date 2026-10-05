import { createZodDto } from '#server/common/dto/create-zod-dto.js';
import { ticketSelectSchema } from '#server/projects/infrastructure/persistence/drizzle/schema/ticket.zod.js';

import { z } from 'zod';

export const QueryTicketsSchema = z
  .object({
    search: z.string().trim().min(1).optional(),
    columnId: ticketSelectSchema.shape.columnId.optional(),
    assigneeUserId: z.string().min(1).optional(),
    priority: ticketSelectSchema.shape.priority.optional(),
  })
  .meta({ id: 'QueryTickets' });

export type QueryTicketsInput = z.infer<typeof QueryTicketsSchema>;

export class QueryTicketsDto extends createZodDto(QueryTicketsSchema) {}
