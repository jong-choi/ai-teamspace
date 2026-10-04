import { ChatMessageSchema } from '#server/chat/dto/chat-message.dto.js';

import { z } from 'zod';

const ChatRealtimeEventBaseSchema = z.object({
  eventId: z.string().uuid(),
  conversationId: z.string().uuid(),
  occurredAt: z.string().datetime(),
});

export const ChatMessageCreatedEventSchema = ChatRealtimeEventBaseSchema.extend(
  {
    type: z.literal('message.created'),
    message: ChatMessageSchema,
  },
);

export const ChatMessageUpdatedEventSchema = ChatRealtimeEventBaseSchema.extend(
  {
    type: z.literal('message.updated'),
    message: ChatMessageSchema,
  },
);

export const ChatConversationReadEventSchema =
  ChatRealtimeEventBaseSchema.extend({
    type: z.literal('conversation.read'),
    userId: z.string(),
    readAt: z.string().datetime(),
  });

export const ChatConversationChangedEventSchema =
  ChatRealtimeEventBaseSchema.extend({
    type: z.literal('conversation.changed'),
  });

export const ChatRealtimeEventSchema = z
  .discriminatedUnion('type', [
    ChatMessageCreatedEventSchema,
    ChatMessageUpdatedEventSchema,
    ChatConversationReadEventSchema,
    ChatConversationChangedEventSchema,
  ])
  .meta({ id: 'ChatRealtimeEvent' });

export type ChatRealtimeEvent = z.infer<typeof ChatRealtimeEventSchema>;
