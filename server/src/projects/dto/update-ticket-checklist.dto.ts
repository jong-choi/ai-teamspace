import { createZodDto } from '#server/common/dto/create-zod-dto.js';
import { ticketChecklistUpdateSchema } from '#server/projects/infrastructure/persistence/drizzle/schema/ticket-checklist.zod.js';

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
