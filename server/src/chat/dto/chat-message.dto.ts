import type { ChatMessage } from '@/chat/domain/chat-message';
import {
  chatOrganizationInvitationMessageContentSchema,
  chatTextMessageContentSchema,
} from '@/chat/domain/chat-message-content';
import { chatMessageSelectSchema } from '@/chat/infrastructure/persistence/drizzle/schema/chat-message.zod';
import { createZodDto } from '@/common/dto/create-zod-dto';

import { z } from 'zod';

const ChatTextMessageResponseContentSchema =
  chatTextMessageContentSchema.extend({
    type: z.literal('text'),
  });

const ChatMessageResponseContentSchema = z.discriminatedUnion('type', [
  ChatTextMessageResponseContentSchema,
  chatOrganizationInvitationMessageContentSchema,
]);

export const ChatMessageSchema = chatMessageSelectSchema
  .omit({
    contentType: true,
    content: true,
    createdAt: true,
    updatedAt: true,
    editedAt: true,
  })
  .extend({
    content: ChatMessageResponseContentSchema,
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    editedAt: z.string().datetime().nullable(),
  })
  .meta({ id: 'ChatMessage' });

export type ChatMessageResponse = z.infer<typeof ChatMessageSchema>;

export function toChatMessageResponse(
  message: ChatMessage,
): ChatMessageResponse {
  const content =
    message.contentType === 'text'
      ? ChatTextMessageResponseContentSchema.parse({
          type: 'text',
          ...chatTextMessageContentSchema.parse(message.content),
        })
      : chatOrganizationInvitationMessageContentSchema.parse(message.content);

  return ChatMessageSchema.parse({
    ...message,
    content,
    createdAt: message.createdAt.toISOString(),
    updatedAt: message.updatedAt.toISOString(),
    editedAt: message.editedAt?.toISOString() ?? null,
  });
}

export class ChatMessageDto extends createZodDto(ChatMessageSchema) {}
