import type { ChatMessage } from '#server/chat/domain/chat-message.js';
import {
  chatMessageInsertSchema,
  chatMessageSelectSchema,
  chatMessageUpdateSchema,
} from '#server/chat/infrastructure/persistence/drizzle/schema/chat-message.zod.js';

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
