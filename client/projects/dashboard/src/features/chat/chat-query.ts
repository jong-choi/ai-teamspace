import {
  getChatControllerGetConversationQueryKey,
  getChatControllerGetMessageQueryKey,
  getChatControllerListConversationsQueryKey,
  getChatControllerListMessagesInfiniteQueryKey,
  useChatControllerGetConversationSuspense,
  useChatControllerGetMessageSuspense,
  useChatControllerListConversationsSuspense,
  useChatControllerListMessagesSuspenseInfinite,
} from '@monorepo-erp/api-client';
import type {
  ChatConversation,
  ChatConversationList,
  ChatMessage,
  ChatMessagePage,
  ChatParticipant,
} from '@monorepo-erp/api-client/schemas';

import type { InfiniteData, QueryClient } from '@tanstack/react-query';

const MESSAGE_PAGE_SIZE = 50;

export type MessageHistory = InfiniteData<ChatMessagePage, string | undefined>;

export type ChatParticipantDisplay = Pick<
  ChatParticipant,
  'userId' | 'name' | 'username' | 'image'
>;

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
    { limit: MESSAGE_PAGE_SIZE },
    {
      query: {
        initialPageParam: undefined,
        getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
      },
    },
  );
}

export function flattenChatMessageHistory(
  history: MessageHistory | undefined,
): ChatMessage[] {
  if (!history) {
    return [];
  }

  const messagesById = new Map<string, ChatMessage>();
  for (const page of history.pages) {
    for (const message of page.items) {
      const current = messagesById.get(message.id);
      if (!current || compareChatMessageVersions(current, message) < 0) {
        messagesById.set(message.id, message);
      }
    }
  }

  return [...messagesById.values()].sort(compareChatMessages);
}

export function mergeCreatedMessage(
  queryClient: QueryClient,
  message: ChatMessage,
  currentUserId: string,
): void {
  const inserted = appendMessageToHistory(queryClient, message);

  const mergeConversation = (
    conversation: ChatConversation,
  ): ChatConversation => {
    const alreadyApplied =
      inserted === false || conversation.latestMessage?.id === message.id;
    const latestMessage = conversation.latestMessage;
    const isNewLatest =
      latestMessage === null || compareChatMessages(latestMessage, message) < 0;
    const fromCurrentUser = message.senderUserId === currentUserId;
    const nextUnreadCount =
      alreadyApplied || fromCurrentUser
        ? conversation.unreadCount
        : conversation.unreadCount + 1;

    if (!isNewLatest && nextUnreadCount === conversation.unreadCount) {
      return conversation;
    }

    return {
      ...conversation,
      latestMessage: isNewLatest ? message : latestMessage,
      updatedAt: isNewLatest ? message.createdAt : conversation.updatedAt,
      unreadCount: nextUnreadCount,
    };
  };

  updateConversationList(
    queryClient,
    message.conversationId,
    mergeConversation,
  );
  updateConversationDetail(
    queryClient,
    message.conversationId,
    mergeConversation,
  );
}

export function mergeUpdatedMessage(
  queryClient: QueryClient,
  message: ChatMessage,
): void {
  replaceMessageInHistory(queryClient, message);

  queryClient.setQueryData<ChatMessage>(
    getChatControllerGetMessageQueryKey(message.conversationId, message.id),
    (current) =>
      !current || compareChatMessageVersions(current, message) >= 0
        ? current
        : message,
  );

  const updateLatest = (conversation: ChatConversation): ChatConversation => {
    const latestMessage = conversation.latestMessage;
    if (
      latestMessage?.id !== message.id ||
      compareChatMessageVersions(latestMessage, message) >= 0
    ) {
      return conversation;
    }

    return { ...conversation, latestMessage: message };
  };

  updateConversationList(queryClient, message.conversationId, updateLatest);
  updateConversationDetail(queryClient, message.conversationId, updateLatest);
}

export async function refreshChatAfterReconnect(
  queryClient: QueryClient,
): Promise<void> {
  const [conversationPrefix] = getChatControllerListConversationsQueryKey();

  await queryClient.invalidateQueries({
    predicate: (query) =>
      query.queryKey.some(
        (key) =>
          typeof key === 'string' &&
          (key === conversationPrefix ||
            key.startsWith(`${conversationPrefix}/`)),
      ),
  });
}

export async function refreshConversationMetadata(
  queryClient: QueryClient,
  conversationId: string,
): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({
      queryKey: getChatControllerListConversationsQueryKey(),
    }),
    queryClient.invalidateQueries({
      queryKey: getChatControllerGetConversationQueryKey(conversationId),
    }),
  ]);
}

function appendMessageToHistory(
  queryClient: QueryClient,
  message: ChatMessage,
): boolean | null {
  let inserted: boolean | null = null;

  queryClient.setQueryData<MessageHistory>(
    getChatControllerListMessagesInfiniteQueryKey(message.conversationId, {
      limit: MESSAGE_PAGE_SIZE,
    }),
    (current) => {
      if (!current || current.pages.length === 0) {
        return current;
      }
      if (
        current.pages.some((page) =>
          page.items.some(({ id }) => id === message.id),
        )
      ) {
        inserted = false;
        return current;
      }

      inserted = true;
      const [latestPage, ...olderPages] = current.pages;
      return {
        ...current,
        pages: [
          {
            ...latestPage,
            items: [...latestPage.items, message].sort(compareChatMessages),
          },
          ...olderPages,
        ],
      };
    },
  );

  return inserted;
}

function replaceMessageInHistory(
  queryClient: QueryClient,
  message: ChatMessage,
): void {
  queryClient.setQueryData<MessageHistory>(
    getChatControllerListMessagesInfiniteQueryKey(message.conversationId, {
      limit: MESSAGE_PAGE_SIZE,
    }),
    (current) => {
      if (!current) {
        return current;
      }

      let changed = false;
      const pages = current.pages.map((page) => {
        let pageChanged = false;
        const items = page.items.map((item) => {
          if (
            item.id !== message.id ||
            compareChatMessageVersions(item, message) >= 0
          ) {
            return item;
          }

          changed = true;
          pageChanged = true;
          return message;
        });

        return pageChanged ? { ...page, items } : page;
      });

      return changed ? { ...current, pages } : current;
    },
  );
}

function updateConversationList(
  queryClient: QueryClient,
  conversationId: string,
  update: (conversation: ChatConversation) => ChatConversation,
): void {
  queryClient.setQueryData<ChatConversationList>(
    getChatControllerListConversationsQueryKey(),
    (current) => {
      if (!current) {
        return current;
      }

      let changed = false;
      const items = current.items.map((conversation) => {
        if (conversation.id !== conversationId) {
          return conversation;
        }

        const nextConversation = update(conversation);
        changed ||= nextConversation !== conversation;
        return nextConversation;
      });
      if (!changed) {
        return current;
      }

      items.sort((left, right) => {
        const byUpdatedAt = right.updatedAt.localeCompare(left.updatedAt);
        return byUpdatedAt !== 0
          ? byUpdatedAt
          : right.id.localeCompare(left.id);
      });

      return { ...current, items };
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

function compareChatMessages(left: ChatMessage, right: ChatMessage): number {
  const byCreatedAt = left.createdAt.localeCompare(right.createdAt);
  return byCreatedAt !== 0 ? byCreatedAt : left.id.localeCompare(right.id);
}

function compareChatMessageVersions(
  left: ChatMessage,
  right: ChatMessage,
): number {
  return left.updatedAt.localeCompare(right.updatedAt);
}

function updateConversationDetail(
  queryClient: QueryClient,
  conversationId: string,
  update: (conversation: ChatConversation) => ChatConversation,
): void {
  queryClient.setQueryData<ChatConversation>(
    getChatControllerGetConversationQueryKey(conversationId),
    (current) => {
      if (!current) {
        return current;
      }

      const nextConversation = update(current);
      return nextConversation === current ? current : nextConversation;
    },
  );
}
