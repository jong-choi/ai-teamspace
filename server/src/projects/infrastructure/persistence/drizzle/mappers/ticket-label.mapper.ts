import type { TicketLabel } from '@/projects/domain/ticket-label';
import {
  ticketLabelInsertSchema,
  ticketLabelSelectSchema,
  ticketLabelUpdateSchema,
} from '@/projects/infrastructure/persistence/drizzle/schema/ticket-label.zod';

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
