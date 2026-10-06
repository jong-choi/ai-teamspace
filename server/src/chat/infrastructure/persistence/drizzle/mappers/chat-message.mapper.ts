import type { ChatMessage } from '@/chat/domain/chat-message';
import {
  chatMessageInsertSchema,
  chatMessageSelectSchema,
  chatMessageUpdateSchema,
} from '@/chat/infrastructure/persistence/drizzle/schema/chat-message.zod';

import type { z } from 'zod';

export function toChatMessageDomain(row: unknown): ChatMessage {
  return chatMessageSelectSchema.parse(row);
}

export function toChatMessageInsert(
  input: z.input<typeof chatMessageInsertSchema>,
) {
  return chatMessageInsertSchema.parse(input);
}

export function toChatMessageUpdate(
  input: z.input<typeof chatMessageUpdateSchema>,
) {
  return chatMessageUpdateSchema.parse(input);
}
