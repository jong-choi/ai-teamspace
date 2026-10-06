import { createZodDto } from '@/common/dto/create-zod-dto';
import { ticketChecklistUpdateSchema } from '@/projects/infrastructure/persistence/drizzle/schema/ticket-checklist.zod';

import { z } from 'zod';

export const UpdateTicketChecklistSchema = ticketChecklistUpdateSchema
  .pick({ title: true })
  .required({ title: true })
  .meta({ id: 'UpdateTicketChecklist' });

export type UpdateTicketChecklistInput = z.infer<
  typeof UpdateTicketChecklistSchema
>;

export class UpdateTicketChecklistDto extends createZodDto(
  UpdateTicketChecklistSchema,
) {}
