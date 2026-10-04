import type { ChatMessage } from '#server/chat/domain/chat-message.js';
import { chatMessageSelectSchema } from '#server/chat/infrastructure/persistence/drizzle/schema/chat-message.zod.js';
import { createZodDto } from '#server/common/dto/create-zod-dto.js';

import { z } from 'zod';

export const ChatMessageSchema = chatMessageSelectSchema
  .omit({
    createdAt: true,
    updatedAt: true,
    editedAt: true,
  })
  .extend({
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    editedAt: z.string().datetime().nullable(),
  })
  .meta({ id: 'ChatMessage' });

export type ChatMessageResponse = z.infer<typeof ChatMessageSchema>;

export function toChatMessageResponse(
  message: ChatMessage,
): ChatMessageResponse {
  return ChatMessageSchema.parse({
    ...message,
    createdAt: message.createdAt.toISOString(),
    updatedAt: message.updatedAt.toISOString(),
    editedAt: message.editedAt?.toISOString() ?? null,
  });
}

export class ChatMessageDto extends createZodDto(ChatMessageSchema) {}
