import { chatMessageContentSchema } from '@/chat/domain/chat-message-content';
import { chatMessage } from '@/chat/infrastructure/persistence/drizzle/schema/chat-message.schema';

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
