import type { Ticket } from '@/projects/domain/ticket';
import {
  ticketInsertSchema,
  ticketSelectSchema,
  ticketUpdateSchema,
} from '@/projects/infrastructure/persistence/drizzle/schema/ticket.zod';

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
