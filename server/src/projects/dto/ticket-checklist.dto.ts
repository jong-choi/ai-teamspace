import { createZodDto } from '#server/common/dto/create-zod-dto.js';
import type { TicketChecklist } from '#server/projects/domain/ticket-checklist.js';
import type { TicketChecklistItem } from '#server/projects/domain/ticket-checklist-item.js';
import { ticketChecklistSelectSchema } from '#server/projects/infrastructure/persistence/drizzle/schema/ticket-checklist.zod.js';
import { ticketChecklistItemSelectSchema } from '#server/projects/infrastructure/persistence/drizzle/schema/ticket-checklist-item.zod.js';

import { z } from 'zod';

export const TicketChecklistItemResponseSchema = ticketChecklistItemSelectSchema
  .pick({
    id: true,
    checklistId: true,
    title: true,
    completed: true,
    position: true,
  })
  .extend({
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .meta({ id: 'TicketChecklistItem' });

export const TicketChecklistResponseSchema = ticketChecklistSelectSchema
  .pick({
    id: true,
    ticketId: true,
    title: true,
    position: true,
  })
  .extend({
    items: z.array(TicketChecklistItemResponseSchema),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .meta({ id: 'TicketChecklist' });

export type TicketChecklistItemResponse = z.infer<
  typeof TicketChecklistItemResponseSchema
>;
export type TicketChecklistResponse = z.infer<
  typeof TicketChecklistResponseSchema
>;

export function toTicketChecklistItemResponse(
  item: TicketChecklistItem,
): TicketChecklistItemResponse {
  return TicketChecklistItemResponseSchema.parse({
    id: item.id,
    checklistId: item.checklistId,
    title: item.title,
    completed: item.completed,
    position: item.position,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  });
}

export function toTicketChecklistResponse(
  checklist: TicketChecklist,
  items: readonly TicketChecklistItem[],
): TicketChecklistResponse {
  return TicketChecklistResponseSchema.parse({
    id: checklist.id,
    ticketId: checklist.ticketId,
    title: checklist.title,
    position: checklist.position,
    items: items.map(toTicketChecklistItemResponse),
    createdAt: checklist.createdAt.toISOString(),
    updatedAt: checklist.updatedAt.toISOString(),
  });
}

export class TicketChecklistItemDto extends createZodDto(
  TicketChecklistItemResponseSchema,
) {}
export class TicketChecklistDto extends createZodDto(
  TicketChecklistResponseSchema,
) {}
