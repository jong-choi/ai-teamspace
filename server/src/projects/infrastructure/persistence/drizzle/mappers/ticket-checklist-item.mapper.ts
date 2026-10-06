import type { TicketChecklistItem } from '#server/projects/domain/ticket-checklist-item.js';
import {
  ticketChecklistItemInsertSchema,
  ticketChecklistItemSelectSchema,
  ticketChecklistItemUpdateSchema,
} from '#server/projects/infrastructure/persistence/drizzle/schema/ticket-checklist-item.zod.js';

import type { z } from 'zod';

export function toTicketChecklistItemDomain(row: unknown): TicketChecklistItem {
  return ticketChecklistItemSelectSchema.parse(row);
}

export function toTicketChecklistItemInsert(
  input: z.input<typeof ticketChecklistItemInsertSchema>,
) {
  return ticketChecklistItemInsertSchema.parse(input);
}

export function toTicketChecklistItemUpdate(
  input: z.input<typeof ticketChecklistItemUpdateSchema>,
) {
  return ticketChecklistItemUpdateSchema.parse(input);
}
