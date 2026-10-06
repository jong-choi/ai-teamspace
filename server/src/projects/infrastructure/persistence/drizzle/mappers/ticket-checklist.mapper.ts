import type { TicketChecklist } from '@/projects/domain/ticket-checklist';
import {
  ticketChecklistInsertSchema,
  ticketChecklistSelectSchema,
  ticketChecklistUpdateSchema,
} from '@/projects/infrastructure/persistence/drizzle/schema/ticket-checklist.zod';

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
