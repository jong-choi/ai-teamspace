import { createZodDto } from '@/common/dto/create-zod-dto';
import { ticketLabelInsertSchema } from '@/projects/infrastructure/persistence/drizzle/schema/ticket-label.zod';

import { z } from 'zod';

export const CreateTicketLabelSchema = ticketLabelInsertSchema
  .pick({ name: true, color: true })
  .meta({ id: 'CreateTicketLabel' });

export type CreateTicketLabelInput = z.infer<typeof CreateTicketLabelSchema>;

export class CreateTicketLabelDto extends createZodDto(
  CreateTicketLabelSchema,
) {}
