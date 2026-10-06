import { createZodDto } from '@/common/dto/create-zod-dto';
import { ticketChecklistItemInsertSchema } from '@/projects/infrastructure/persistence/drizzle/schema/ticket-checklist-item.zod';

import { z } from 'zod';

export const CreateTicketChecklistItemSchema = ticketChecklistItemInsertSchema
  .pick({ title: true })
  .meta({ id: 'CreateTicketChecklistItem' });

export type CreateTicketChecklistItemInput = z.infer<
  typeof CreateTicketChecklistItemSchema
>;

export class CreateTicketChecklistItemDto extends createZodDto(
  CreateTicketChecklistItemSchema,
) {}
