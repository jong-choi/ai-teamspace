import { ticketLabelSelectSchema } from '@/projects/infrastructure/persistence/drizzle/schema/ticket-label.zod';

import { z } from 'zod';

export const TicketLabelSchema = ticketLabelSelectSchema.meta({
  id: 'TicketLabelDomain',
});

export type TicketLabel = z.infer<typeof TicketLabelSchema>;
export type TicketLabelColor = TicketLabel['color'];
