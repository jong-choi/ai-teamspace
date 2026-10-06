import { createZodDto } from '#server/common/dto/create-zod-dto.js';
import { ticketChecklistItemInsertSchema } from '#server/projects/infrastructure/persistence/drizzle/schema/ticket-checklist-item.zod.js';

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
