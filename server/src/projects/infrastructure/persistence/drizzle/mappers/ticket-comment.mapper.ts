import type { TicketComment } from '#server/projects/domain/ticket-comment.js';
import {
  ticketCommentInsertSchema,
  ticketCommentSelectSchema,
  ticketCommentUpdateSchema,
} from '#server/projects/infrastructure/persistence/drizzle/schema/ticket-comment.zod.js';

import type { z } from 'zod';

export function toTicketCommentDomain(row: unknown): TicketComment {
  return ticketCommentSelectSchema.parse(row);
}

export function toTicketCommentInsert(
  input: z.input<typeof ticketCommentInsertSchema>,
) {
  return ticketCommentInsertSchema.parse(input);
}

export function toTicketCommentUpdate(
  input: z.input<typeof ticketCommentUpdateSchema>,
) {
  return ticketCommentUpdateSchema.parse(input);
}
