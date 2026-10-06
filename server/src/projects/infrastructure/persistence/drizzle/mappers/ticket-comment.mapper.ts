import type { TicketComment } from '@/projects/domain/ticket-comment';
import {
  ticketCommentInsertSchema,
  ticketCommentSelectSchema,
  ticketCommentUpdateSchema,
} from '@/projects/infrastructure/persistence/drizzle/schema/ticket-comment.zod';

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
