import { createZodDto } from '@/common/dto/create-zod-dto';
import { ticketChecklistInsertSchema } from '@/projects/infrastructure/persistence/drizzle/schema/ticket-checklist.zod';

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
