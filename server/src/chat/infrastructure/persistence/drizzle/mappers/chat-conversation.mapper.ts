import type { ChatConversation } from '@/chat/domain/chat-conversation';
import {
  chatConversationInsertSchema,
  chatConversationSelectSchema,
  chatConversationUpdateSchema,
} from '@/chat/infrastructure/persistence/drizzle/schema/chat-conversation.zod';

import type { z } from 'zod';

export function toChatConversationDomain(row: unknown): ChatConversation {
  return chatConversationSelectSchema.parse(row);
}

export function toChatConversationInsert(
  input: z.input<typeof chatConversationInsertSchema>,
) {
  return chatConversationInsertSchema.parse(input);
}

export function toChatConversationUpdate(
  input: z.input<typeof chatConversationUpdateSchema>,
) {
  return chatConversationUpdateSchema.parse(input);
}
