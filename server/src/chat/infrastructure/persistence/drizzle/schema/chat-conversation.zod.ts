import { chatConversation } from '@/chat/infrastructure/persistence/drizzle/schema/chat-conversation.schema';

import {
  createInsertSchema,
  createSelectSchema,
  createUpdateSchema,
} from 'drizzle-zod';
import { z } from 'zod';

export const chatChannelNameSchema = z.string().trim().min(1).max(80);
export const chatChannelTopicSchema = z.string().trim().max(250);

export const chatConversationSelectSchema =
  createSelectSchema(chatConversation);
export const chatConversationInsertSchema =
  createInsertSchema(chatConversation);
export const chatConversationUpdateSchema =
  createUpdateSchema(chatConversation);
