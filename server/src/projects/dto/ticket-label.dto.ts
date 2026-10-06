import { createZodDto } from '@/common/dto/create-zod-dto';
import type { TicketLabel } from '@/projects/domain/ticket-label';
import { ticketLabelSelectSchema } from '@/projects/infrastructure/persistence/drizzle/schema/ticket-label.zod';

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
