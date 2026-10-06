import { createZodDto } from '#server/common/dto/create-zod-dto.js';
import { ticketChecklistInsertSchema } from '#server/projects/infrastructure/persistence/drizzle/schema/ticket-checklist.zod.js';

import { z } from 'zod';

export const CreateTicketChecklistSchema = ticketChecklistInsertSchema
  .pick({ title: true })
  .meta({ id: 'CreateTicketChecklist' });

export type CreateTicketChecklistInput = z.infer<
  typeof CreateTicketChecklistSchema
>;

export class CreateTicketChecklistDto extends createZodDto(
  CreateTicketChecklistSchema,
) {}
