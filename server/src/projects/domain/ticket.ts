import { ticketSelectSchema } from '#server/projects/infrastructure/persistence/drizzle/schema/ticket.zod.js';

import { z } from 'zod';

export const TicketSchema = ticketSelectSchema.meta({ id: 'TicketDomain' });

export type Ticket = z.infer<typeof TicketSchema>;
export type TicketPriority = Ticket['priority'];
