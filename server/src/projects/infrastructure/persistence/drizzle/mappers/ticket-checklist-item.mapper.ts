import type { TicketChecklistItem } from '@/projects/domain/ticket-checklist-item';
import {
  ticketChecklistItemInsertSchema,
  ticketChecklistItemSelectSchema,
  ticketChecklistItemUpdateSchema,
} from '@/projects/infrastructure/persistence/drizzle/schema/ticket-checklist-item.zod';

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
