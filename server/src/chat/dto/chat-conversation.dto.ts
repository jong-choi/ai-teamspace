import type { ChatConversationState } from '#server/chat/domain/chat-conversation-state.js';
import {
  ChatMessageSchema,
  toChatMessageResponse,
} from '#server/chat/dto/chat-message.dto.js';
import { chatConversationSelectSchema } from '#server/chat/infrastructure/persistence/drizzle/schema/chat-conversation.zod.js';
import { chatParticipantSelectSchema } from '#server/chat/infrastructure/persistence/drizzle/schema/chat-participant.zod.js';
import type { ChatDirectoryUser } from '#server/chat/infrastructure/user-directory/user-directory.provider.js';
import { createZodDto } from '#server/common/dto/create-zod-dto.js';

import { z } from 'zod';

export const ChatConversationParticipantSchema = chatParticipantSelectSchema
  .pick({ userId: true })
  .extend({
    name: z.string(),
    username: z.string().nullable(),
    image: z.string().nullable(),
    joinedAt: z.string().datetime(),
    lastReadAt: z.string().datetime().nullable(),
  })
  .meta({ id: 'ChatParticipant' });

export const ChatConversationSchema = chatConversationSelectSchema
  .pick({
    id: true,
    kind: true,
    name: true,
    topic: true,
  })
  .extend({
    participants: z.array(ChatConversationParticipantSchema),
    unreadCount: z.number().int().nonnegative(),
    latestMessage: ChatMessageSchema.nullable(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .meta({ id: 'ChatConversation' });

export type ChatConversationResponse = z.infer<typeof ChatConversationSchema>;

export function toChatConversationResponse(
  state: ChatConversationState,
  usersById: ReadonlyMap<string, ChatDirectoryUser>,
): ChatConversationResponse {
  const participants = state.participants.flatMap((participant) => {
    const user = usersById.get(participant.userId);
    if (!user) {
      return [];
    }

    return [
      {
        userId: user.id,
        name: user.name,
        username: user.username,
        image: user.image,
        joinedAt: participant.joinedAt.toISOString(),
        lastReadAt: participant.lastReadAt?.toISOString() ?? null,
      },
    ];
  });

  return ChatConversationSchema.parse({
    id: state.conversation.id,
    kind: state.conversation.kind,
    name: state.conversation.name,
    topic: state.conversation.topic,
    participants,
    unreadCount: state.unreadCount,
    latestMessage: state.latestMessage
      ? toChatMessageResponse(state.latestMessage)
      : null,
    createdAt: state.conversation.createdAt.toISOString(),
    updatedAt: state.conversation.updatedAt.toISOString(),
  });
}

export class ChatConversationDto extends createZodDto(ChatConversationSchema) {}
