import { createZodDto } from '#server/common/dto/create-zod-dto.js';
import type { TicketLabel } from '#server/projects/domain/ticket-label.js';
import { ticketLabelSelectSchema } from '#server/projects/infrastructure/persistence/drizzle/schema/ticket-label.zod.js';

import { z } from 'zod';

export const TicketLabelResponseSchema = ticketLabelSelectSchema
  .pick({
    id: true,
    projectId: true,
    name: true,
    color: true,
  })
  .extend({
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .meta({ id: 'TicketLabel' });

export const TicketLabelListSchema = z
  .object({ items: z.array(TicketLabelResponseSchema) })
  .meta({ id: 'TicketLabelList' });

export type TicketLabelResponse = z.infer<typeof TicketLabelResponseSchema>;
export type TicketLabelListResponse = z.infer<typeof TicketLabelListSchema>;

export function toTicketLabelResponse(label: TicketLabel): TicketLabelResponse {
  return TicketLabelResponseSchema.parse({
    id: label.id,
    projectId: label.projectId,
    name: label.name,
    color: label.color,
    createdAt: label.createdAt.toISOString(),
    updatedAt: label.updatedAt.toISOString(),
  });
}

export class TicketLabelDto extends createZodDto(TicketLabelResponseSchema) {}
export class TicketLabelListDto extends createZodDto(TicketLabelListSchema) {}
