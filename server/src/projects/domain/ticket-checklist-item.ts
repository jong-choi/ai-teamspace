import { ticketChecklistItemSelectSchema } from '#server/projects/infrastructure/persistence/drizzle/schema/ticket-checklist-item.zod.js';

import { z } from 'zod';

export const TicketChecklistItemSchema = ticketChecklistItemSelectSchema.meta({
  id: 'TicketChecklistItemDomain',
});

export type TicketChecklistItem = z.infer<typeof TicketChecklistItemSchema>;
