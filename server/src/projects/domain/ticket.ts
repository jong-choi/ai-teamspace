import { ticketSelectSchema } from '@/projects/infrastructure/persistence/drizzle/schema/ticket.zod';

import { z } from 'zod';

export const TicketSchema = ticketSelectSchema.meta({ id: 'TicketDomain' });

export type Ticket = z.infer<typeof TicketSchema>;
export type TicketPriority = Ticket['priority'];
