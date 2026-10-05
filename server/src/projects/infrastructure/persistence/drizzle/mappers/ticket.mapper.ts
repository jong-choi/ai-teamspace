import type { Ticket } from '#server/projects/domain/ticket.js';
import {
  ticketInsertSchema,
  ticketSelectSchema,
  ticketUpdateSchema,
} from '#server/projects/infrastructure/persistence/drizzle/schema/ticket.zod.js';

import type { z } from 'zod';

export function toTicketDomain(row: unknown): Ticket {
  return ticketSelectSchema.parse(row);
}

export function toTicketInsert(input: z.input<typeof ticketInsertSchema>) {
  return ticketInsertSchema.parse(input);
}

export function toTicketUpdate(input: z.input<typeof ticketUpdateSchema>) {
  return ticketUpdateSchema.parse(input);
}
