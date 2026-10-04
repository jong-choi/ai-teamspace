import {
  useChatControllerGetConversationSuspense,
  useChatControllerGetMessageSuspense,
  useChatControllerListConversationsSuspense,
  useChatControllerListMessagesSuspenseInfinite,
} from '@repo/client/api-client';
import type {
  ChatConversation,
  ChatParticipant,
} from '@repo/client/api-client/schemas';
import { CHAT_MESSAGE_PAGE_SIZE } from '@core/features/chat/chat-message-history';
import type { ChatParticipantDisplay } from '@core/features/chat/chat-presenter';

export function useChatConversations() {
  return useChatControllerListConversationsSuspense<ChatConversation[]>({
    query: {
      select: (response) => response.items,
    },
  });
}

export function useChatConversationHeader(conversationId: string) {
  type HeaderData = Pick<ChatConversation, 'id' | 'kind' | 'name' | 'topic'> & {
    participants: ChatParticipantDisplay[];
  };

  return useChatControllerGetConversationSuspense<HeaderData>(conversationId, {
    query: {
      select: (response) => ({
        id: response.id,
        kind: response.kind,
        name: response.name,
        topic: response.topic,
        participants: response.participants.map(toChatParticipantDisplay),
      }),
    },
  });
}

export function useChatConversationParticipants(conversationId: string) {
  return useChatControllerGetConversationSuspense<ChatParticipantDisplay[]>(
    conversationId,
    {
      query: {
        select: (response) =>
          response.participants.map(toChatParticipantDisplay),
      },
    },
  );
}

export function useChatConversationReadState(conversationId: string) {
  type ReadState = Pick<
    ChatConversation,
    'id' | 'unreadCount' | 'latestMessage'
  >;

  return useChatControllerGetConversationSuspense<ReadState>(conversationId, {
    query: {
      select: (response) => ({
        id: response.id,
        unreadCount: response.unreadCount,
        latestMessage: response.latestMessage,
      }),
    },
  });
}

export function useChatMessage(conversationId: string, messageId: string) {
  return useChatControllerGetMessageSuspense(conversationId, messageId);
}

export function useChatMessageHistory(conversationId: string) {
  return useChatControllerListMessagesSuspenseInfinite(
    conversationId,
    { limit: CHAT_MESSAGE_PAGE_SIZE },
    {
      query: {
        initialPageParam: undefined,
        getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
      },
    },
  );
}

function toChatParticipantDisplay(
  participant: ChatParticipant,
): ChatParticipantDisplay {
  return {
    userId: participant.userId,
    name: participant.name,
    username: participant.username,
    image: participant.image,
  };
}
