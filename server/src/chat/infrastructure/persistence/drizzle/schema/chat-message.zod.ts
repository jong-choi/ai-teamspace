import { chatMessage } from '#server/chat/infrastructure/persistence/drizzle/schema/chat-message.schema.js';

import {
  createInsertSchema,
  createSelectSchema,
  createUpdateSchema,
} from 'drizzle-zod';
import { z } from 'zod';

export const chatTextMessageContentSchema = z.object({
  text: z.string().trim().min(1).max(10_000),
});

export const chatMessageContentSchema = chatTextMessageContentSchema;

export const chatMessageSelectSchema = createSelectSchema(chatMessage, {
  content: chatMessageContentSchema,
});
export const chatMessageInsertSchema = createInsertSchema(chatMessage, {
  content: chatMessageContentSchema,
});
export const chatMessageUpdateSchema = createUpdateSchema(chatMessage, {
  content: chatMessageContentSchema,
});
