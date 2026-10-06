import { ticketCommentSelectSchema } from '#server/projects/infrastructure/persistence/drizzle/schema/ticket-comment.zod.js';

import { z } from 'zod';

export const TicketCommentSchema = ticketCommentSelectSchema.meta({
  id: 'TicketCommentDomain',
});

export type TicketComment = z.infer<typeof TicketCommentSchema>;
