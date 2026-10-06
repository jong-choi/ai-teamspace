import type { AuthUserIdentity } from '@/auth/auth-user-directory.service';
import type { ChatConversationState } from '@/chat/domain/chat-conversation-state';
import {
  ChatMessageSchema,
  toChatMessageResponse,
} from '@/chat/dto/chat-message.dto';
import { chatConversationSelectSchema } from '@/chat/infrastructure/persistence/drizzle/schema/chat-conversation.zod';
import { chatParticipantSelectSchema } from '@/chat/infrastructure/persistence/drizzle/schema/chat-participant.zod';
import { createZodDto } from '@/common/dto/create-zod-dto';

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
  usersById: ReadonlyMap<string, AuthUserIdentity>,
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
