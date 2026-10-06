import type { TicketChecklist } from '#server/projects/domain/ticket-checklist.js';
import {
  ticketChecklistInsertSchema,
  ticketChecklistSelectSchema,
  ticketChecklistUpdateSchema,
} from '#server/projects/infrastructure/persistence/drizzle/schema/ticket-checklist.zod.js';

import type { z } from 'zod';

export function toTicketChecklistDomain(row: unknown): TicketChecklist {
  return ticketChecklistSelectSchema.parse(row);
}

export function toTicketChecklistInsert(
  input: z.input<typeof ticketChecklistInsertSchema>,
) {
  return ticketChecklistInsertSchema.parse(input);
}

export function toTicketChecklistUpdate(
  input: z.input<typeof ticketChecklistUpdateSchema>,
) {
  return ticketChecklistUpdateSchema.parse(input);
}
