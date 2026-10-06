import { ticketChecklistSelectSchema } from '@/projects/infrastructure/persistence/drizzle/schema/ticket-checklist.zod';

import { z } from 'zod';

export const TicketChecklistSchema = ticketChecklistSelectSchema.meta({
  id: 'TicketChecklistDomain',
});

export type TicketChecklist = z.infer<typeof TicketChecklistSchema>;
