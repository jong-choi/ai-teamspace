import {
  getChatControllerGetConversationQueryKey,
  getChatControllerGetMessageQueryKey,
  getChatControllerListConversationsQueryKey,
  getChatControllerListMessagesInfiniteQueryKey,
} from '@repo/client/api-client';
import type {
  ChatConversation,
  ChatConversationList,
  ChatMessage,
} from '@repo/client/api-client/schemas';
import {
  CHAT_MESSAGE_PAGE_SIZE,
  compareChatMessages,
  compareChatMessageVersions,
  type MessageHistory,
} from '@core/features/chat/chat-message-history';

import type { QueryClient } from '@tanstack/react-query';

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

  updateConversationCaches(
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

  updateConversationCaches(queryClient, message.conversationId, updateLatest);
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
  const queryKey = getChatControllerListMessagesInfiniteQueryKey(
    message.conversationId,
    { limit: CHAT_MESSAGE_PAGE_SIZE },
  );
  const current = queryClient.getQueryData<MessageHistory>(queryKey);

  if (!current || current.pages.length === 0) {
    return null;
  }
  if (
    current.pages.some((page) => page.items.some(({ id }) => id === message.id))
  ) {
    return false;
  }

  const [latestPage, ...olderPages] = current.pages;
  queryClient.setQueryData<MessageHistory>(queryKey, {
    ...current,
    pages: [
      {
        ...latestPage,
        items: [...latestPage.items, message].sort(compareChatMessages),
      },
      ...olderPages,
    ],
  });

  return true;
}

function replaceMessageInHistory(
  queryClient: QueryClient,
  message: ChatMessage,
): void {
  queryClient.setQueryData<MessageHistory>(
    getChatControllerListMessagesInfiniteQueryKey(message.conversationId, {
      limit: CHAT_MESSAGE_PAGE_SIZE,
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

function updateConversationCaches(
  queryClient: QueryClient,
  conversationId: string,
  update: (conversation: ChatConversation) => ChatConversation,
): void {
  updateConversationList(queryClient, conversationId, update);
  updateConversationDetail(queryClient, conversationId, update);
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
