import { createZodDto } from '#server/common/dto/create-zod-dto.js';
import { ticketLabelInsertSchema } from '#server/projects/infrastructure/persistence/drizzle/schema/ticket-label.zod.js';

import { z } from 'zod';

export const CreateTicketLabelSchema = ticketLabelInsertSchema
  .pick({ name: true, color: true })
  .meta({ id: 'CreateTicketLabel' });

export type CreateTicketLabelInput = z.infer<typeof CreateTicketLabelSchema>;

export class CreateTicketLabelDto extends createZodDto(
  CreateTicketLabelSchema,
) {}
