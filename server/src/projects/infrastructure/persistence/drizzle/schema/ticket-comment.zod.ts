import { ticketComment } from '@/projects/infrastructure/persistence/drizzle/schema/ticket-comment.schema';

import {
  createInsertSchema,
  createSelectSchema,
  createUpdateSchema,
} from 'drizzle-zod';
import { z } from 'zod';

export const ticketCommentContentSchema = z.string().min(1);
const ticketCommentUserIdSchema = z.string().min(1);

const fieldRefinements = {
  authorUserId: ticketCommentUserIdSchema,
  contentMarkdown: ticketCommentContentSchema,
};

export const ticketCommentSelectSchema = createSelectSchema(
  ticketComment,
  fieldRefinements,
);
export const ticketCommentInsertSchema = createInsertSchema(
  ticketComment,
  fieldRefinements,
);
export const ticketCommentUpdateSchema = createUpdateSchema(
  ticketComment,
  fieldRefinements,
).partial();
