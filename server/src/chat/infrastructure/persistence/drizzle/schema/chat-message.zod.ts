import { chatMessageContentSchema } from '#server/chat/domain/chat-message-content.js';
import { chatMessage } from '#server/chat/infrastructure/persistence/drizzle/schema/chat-message.schema.js';

import {
  createInsertSchema,
  createSelectSchema,
  createUpdateSchema,
} from 'drizzle-zod';

export const chatMessageSelectSchema = createSelectSchema(chatMessage, {
  content: chatMessageContentSchema,
});
export const chatMessageInsertSchema = createInsertSchema(chatMessage, {
  content: chatMessageContentSchema,
});
export const chatMessageUpdateSchema = createUpdateSchema(chatMessage, {
  content: chatMessageContentSchema,
});
