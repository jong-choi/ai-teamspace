import {
  type ChatControllerGetConversation200ParticipantsItem,
  type ChatControllerGetConversationQueryResult,
  type ChatControllerGetMessageQueryResult,
  type ChatControllerListConversations200ItemsItem,
  type ChatControllerListConversationsQueryResult,
  chatControllerListMessages,
  type ChatControllerListMessages200ItemsItem,
  type ChatControllerListMessagesQueryResult,
  getChatControllerGetConversationQueryKey,
  getChatControllerGetConversationQueryOptions,
  getChatControllerGetMessageQueryKey,
  getChatControllerGetMessageQueryOptions,
  getChatControllerListConversationsQueryKey,
  getChatControllerListConversationsQueryOptions,
  getChatControllerListMessagesQueryKey,
} from '@monorepo-erp/api-client';

import {
  type InfiniteData,
  type QueryClient,
  skipToken,
  useSuspenseInfiniteQuery,
  useSuspenseQuery,
} from '@tanstack/react-query';

const MESSAGE_PAGE_SIZE = 50;
const INITIAL_MESSAGE_CURSOR: string | null = null;

type MessageHistory = InfiniteData<
  ChatControllerListMessagesQueryResult,
  unknown
>;

export type ChatParticipantDisplay = Pick<
  ChatControllerGetConversation200ParticipantsItem,
  'userId' | 'name' | 'username' | 'image'
>;

export function useChatConversations() {
  const options = getChatControllerListConversationsQueryOptions<
    ChatControllerListConversations200ItemsItem[]
  >({
    query: {
      select: (response) => response.data.items,
    },
  });
  const queryFn = requireQueryFn(options.queryFn);

  return useSuspenseQuery({ ...options, queryFn });
}

export function useChatConversationHeader(conversationId: string) {
  type HeaderData = Pick<
    ChatControllerGetConversationQueryResult['data'],
    'id' | 'kind' | 'name' | 'topic'
  > & {
    participants: ChatParticipantDisplay[];
  };
  const options = getChatControllerGetConversationQueryOptions<HeaderData>(
    conversationId,
    {
      query: {
        select: (response) => ({
          id: response.data.id,
          kind: response.data.kind,
          name: response.data.name,
          topic: response.data.topic,
          participants: response.data.participants.map(
            toChatParticipantDisplay,
          ),
        }),
      },
    },
  );
  const queryFn = requireQueryFn(options.queryFn);

  return useSuspenseQuery({ ...options, queryFn });
}

export function useChatConversationParticipants(conversationId: string) {
  const options = getChatControllerGetConversationQueryOptions<
    ChatParticipantDisplay[]
  >(conversationId, {
    query: {
      select: (response) =>
        response.data.participants.map(toChatParticipantDisplay),
    },
  });
  const queryFn = requireQueryFn(options.queryFn);

  return useSuspenseQuery({ ...options, queryFn });
}

export function useChatConversationReadState(conversationId: string) {
  type ReadState = Pick<
    ChatControllerGetConversationQueryResult['data'],
    'id' | 'unreadCount' | 'latestMessage'
  >;
  const options = getChatControllerGetConversationQueryOptions<ReadState>(
    conversationId,
    {
      query: {
        select: (response) => ({
          id: response.data.id,
          unreadCount: response.data.unreadCount,
          latestMessage: response.data.latestMessage,
        }),
      },
    },
  );
  const queryFn = requireQueryFn(options.queryFn);

  return useSuspenseQuery({ ...options, queryFn });
}

export function useChatMessage(conversationId: string, messageId: string) {
  const options = getChatControllerGetMessageQueryOptions<
    ChatControllerGetMessageQueryResult['data']
  >(conversationId, messageId, {
    query: {
      select: (response) => response.data,
    },
  });
  const queryFn = requireQueryFn(options.queryFn);

  return useSuspenseQuery({ ...options, queryFn });
}

export function useChatMessageHistory(conversationId: string) {
  return useSuspenseInfiniteQuery({
    queryKey: getChatControllerListMessagesQueryKey(conversationId),
    initialPageParam: INITIAL_MESSAGE_CURSOR,
    queryFn: ({ pageParam, signal }) =>
      chatControllerListMessages(
        conversationId,
        {
          before: pageParam ?? undefined,
          limit: MESSAGE_PAGE_SIZE,
        },
        { signal },
      ),
    getNextPageParam: (lastPage) => lastPage.data.nextCursor ?? undefined,
  });
}

export function flattenChatMessageHistory(
  history: MessageHistory | undefined,
): ChatControllerListMessages200ItemsItem[] {
  if (!history) {
    return [];
  }

  const messagesById = new Map<
    string,
    ChatControllerListMessages200ItemsItem
  >();
  for (const page of history.pages) {
    for (const message of page.data.items) {
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
  message: ChatControllerListMessages200ItemsItem,
  currentUserId: string,
): void {
  const inserted = appendMessageToHistory(queryClient, message);

  const mergeConversation = (
    conversation: ChatControllerListConversations200ItemsItem,
  ): ChatControllerListConversations200ItemsItem => {
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
  message: ChatControllerListMessages200ItemsItem,
): void {
  replaceMessageInHistory(queryClient, message);

  queryClient.setQueryData<ChatControllerGetMessageQueryResult>(
    getChatControllerGetMessageQueryKey(message.conversationId, message.id),
    (current) =>
      !current || compareChatMessageVersions(current.data, message) >= 0
        ? current
        : { ...current, data: message },
  );

  const updateLatest = (
    conversation: ChatControllerListConversations200ItemsItem,
  ) => {
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
    predicate: (query) => {
      const [key] = query.queryKey;
      return (
        typeof key === 'string' &&
        (key === conversationPrefix || key.startsWith(`${conversationPrefix}/`))
      );
    },
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
  message: ChatControllerListMessages200ItemsItem,
): boolean | null {
  let inserted: boolean | null = null;

  queryClient.setQueryData<MessageHistory>(
    getChatControllerListMessagesQueryKey(message.conversationId),
    (current) => {
      if (!current || current.pages.length === 0) {
        return current;
      }
      if (
        current.pages.some((page) =>
          page.data.items.some(({ id }) => id === message.id),
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
            data: {
              ...latestPage.data,
              items: [...latestPage.data.items, message].sort(
                compareChatMessages,
              ),
            },
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
  message: ChatControllerListMessages200ItemsItem,
): void {
  queryClient.setQueryData<MessageHistory>(
    getChatControllerListMessagesQueryKey(message.conversationId),
    (current) => {
      if (!current) {
        return current;
      }

      let changed = false;
      const pages = current.pages.map((page) => {
        let pageChanged = false;
        const items = page.data.items.map((item) => {
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

        return pageChanged ? { ...page, data: { ...page.data, items } } : page;
      });

      return changed ? { ...current, pages } : current;
    },
  );
}

function updateConversationList(
  queryClient: QueryClient,
  conversationId: string,
  update: (
    conversation: ChatControllerListConversations200ItemsItem,
  ) => ChatControllerListConversations200ItemsItem,
): void {
  queryClient.setQueryData<ChatControllerListConversationsQueryResult>(
    getChatControllerListConversationsQueryKey(),
    (current) => {
      if (!current) {
        return current;
      }

      let changed = false;
      const items = current.data.items.map((conversation) => {
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

      return {
        ...current,
        data: { ...current.data, items },
      };
    },
  );
}

function toChatParticipantDisplay(
  participant: ChatControllerGetConversation200ParticipantsItem,
): ChatParticipantDisplay {
  return {
    userId: participant.userId,
    name: participant.name,
    username: participant.username,
    image: participant.image,
  };
}

function compareChatMessages(
  left: ChatControllerListMessages200ItemsItem,
  right: ChatControllerListMessages200ItemsItem,
): number {
  const byCreatedAt = left.createdAt.localeCompare(right.createdAt);
  return byCreatedAt !== 0 ? byCreatedAt : left.id.localeCompare(right.id);
}

function compareChatMessageVersions(
  left: ChatControllerListMessages200ItemsItem,
  right: ChatControllerListMessages200ItemsItem,
): number {
  return left.updatedAt.localeCompare(right.updatedAt);
}

function requireQueryFn<TQueryFn>(
  queryFn: TQueryFn | typeof skipToken | undefined,
): TQueryFn {
  if (queryFn === undefined || queryFn === skipToken) {
    throw new Error('생성된 채팅 queryFn을 사용할 수 없습니다.');
  }
  return queryFn;
}

function updateConversationDetail(
  queryClient: QueryClient,
  conversationId: string,
  update: (
    conversation: ChatControllerListConversations200ItemsItem,
  ) => ChatControllerListConversations200ItemsItem,
): void {
  queryClient.setQueryData<ChatControllerGetConversationQueryResult>(
    getChatControllerGetConversationQueryKey(conversationId),
    (current) => {
      if (!current) {
        return current;
      }

      const nextConversation = update(current.data);
      return nextConversation === current.data
        ? current
        : { ...current, data: nextConversation };
    },
  );
}
