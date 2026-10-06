import type { TicketLabel } from '#server/projects/domain/ticket-label.js';
import {
  ticketLabelInsertSchema,
  ticketLabelSelectSchema,
  ticketLabelUpdateSchema,
} from '#server/projects/infrastructure/persistence/drizzle/schema/ticket-label.zod.js';

import type { z } from 'zod';

export function toTicketLabelDomain(row: unknown): TicketLabel {
  return ticketLabelSelectSchema.parse(row);
}

export function toTicketLabelInsert(
  input: z.input<typeof ticketLabelInsertSchema>,
) {
  return ticketLabelInsertSchema.parse(input);
}

export function toTicketLabelUpdate(
  input: z.input<typeof ticketLabelUpdateSchema>,
) {
  return ticketLabelUpdateSchema.parse(input);
}
