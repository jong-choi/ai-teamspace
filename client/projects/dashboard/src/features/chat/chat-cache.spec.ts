import {
  getChatControllerListConversationsQueryKey,
  getChatControllerListMessagesInfiniteQueryKey,
} from '@repo/client/api-client';
import type {
  ChatConversation,
  ChatConversationList,
  ChatMessage,
} from '@repo/client/api-client/schemas';
import {
  mergeCreatedMessage,
  mergeUpdatedMessage,
} from '@core/features/chat/chat-cache';
import type { MessageHistory } from '@core/features/chat/chat-message-history';

import { describe, expect, it } from '@jest/globals';
import { QueryClient } from '@tanstack/react-query';

const conversationId = '11111111-1111-4111-8111-111111111111';
const actorUserId = 'actor-user';
const peerUserId = 'peer-user';
const messageHistoryQueryKey = getChatControllerListMessagesInfiniteQueryKey(
  conversationId,
  { limit: 50 },
);

const conversation: ChatConversation = {
  id: conversationId,
  kind: 'direct',
  name: null,
  topic: null,
  participants: [
    {
      userId: actorUserId,
      name: '나',
      username: 'me',
      image: null,
      joinedAt: '2026-10-04T00:00:00.000Z',
      lastReadAt: null,
    },
    {
      userId: peerUserId,
      name: '상대방',
      username: 'peer',
      image: null,
      joinedAt: '2026-10-04T00:00:00.000Z',
      lastReadAt: null,
    },
  ],
  unreadCount: 0,
  latestMessage: null,
  createdAt: '2026-10-04T00:00:00.000Z',
  updatedAt: '2026-10-04T00:00:00.000Z',
};

const olderMessage: ChatMessage = {
  id: '22222222-2222-4222-8222-222222222222',
  conversationId,
  senderKind: 'user',
  senderUserId: actorUserId,
  content: { type: 'text', text: '이전 메시지' },
  referenceKind: null,
  referenceId: null,
  createdAt: '2026-10-04T00:01:00.000Z',
  updatedAt: '2026-10-04T00:01:00.000Z',
  editedAt: null,
};

const createdMessage: ChatMessage = {
  ...olderMessage,
  id: '33333333-3333-4333-8333-333333333333',
  senderUserId: peerUserId,
  content: { type: 'text', text: '새 메시지' },
  createdAt: '2026-10-04T00:02:00.000Z',
  updatedAt: '2026-10-04T00:02:00.000Z',
};

describe('채팅 클라이언트 캐시', () => {
  it('새 메시지는 최신 페이지에 한 번만 합치고 읽지 않은 수를 올린다', () => {
    const queryClient = createQueryClient();
    seedConversationList(queryClient);
    seedMessageHistory(queryClient);

    mergeCreatedMessage(queryClient, createdMessage, actorUserId);
    mergeCreatedMessage(queryClient, createdMessage, actorUserId);

    const history = queryClient.getQueryData<MessageHistory>(
      messageHistoryQueryKey,
    );
    expect(history?.pages[0]?.items.map(({ id }) => id)).toEqual([
      olderMessage.id,
      createdMessage.id,
    ]);

    const conversations = queryClient.getQueryData<ChatConversationList>(
      getChatControllerListConversationsQueryKey(),
    );
    expect(conversations?.items[0]?.unreadCount).toBe(2);
    expect(conversations?.items[0]?.latestMessage?.id).toBe(createdMessage.id);
  });

  it('수정 이벤트는 기존 메시지를 교체하고 최신 메시지 메타데이터도 맞춘다', () => {
    const queryClient = createQueryClient();
    seedConversationList(queryClient, {
      ...conversation,
      latestMessage: olderMessage,
    });
    seedMessageHistory(queryClient);

    const updatedMessage = {
      ...olderMessage,
      content: { type: 'text', text: '수정된 메시지' },
      editedAt: '2026-10-04T00:03:00.000Z',
      updatedAt: '2026-10-04T00:03:00.000Z',
    } satisfies ChatMessage;

    mergeUpdatedMessage(queryClient, updatedMessage);

    const history = queryClient.getQueryData<MessageHistory>(
      messageHistoryQueryKey,
    );
    expect(history?.pages[0]?.items[0]?.content).toEqual({
      type: 'text',
      text: '수정된 메시지',
    });

    const conversations = queryClient.getQueryData<ChatConversationList>(
      getChatControllerListConversationsQueryKey(),
    );
    expect(conversations?.items[0]?.latestMessage?.content).toEqual({
      type: 'text',
      text: '수정된 메시지',
    });
  });

  it('생성 이벤트 순서가 뒤집혀도 이력과 최근 메시지 순서를 되돌리지 않는다', () => {
    const queryClient = createQueryClient();
    seedConversationList(queryClient);
    seedMessageHistory(queryClient);
    const newerMessage = {
      ...createdMessage,
      id: '55555555-5555-4555-8555-555555555555',
      createdAt: '2026-10-04T00:03:00.000Z',
      updatedAt: '2026-10-04T00:03:00.000Z',
    } satisfies ChatMessage;
    const lateOlderMessage = {
      ...createdMessage,
      id: '44444444-4444-4444-8444-444444444444',
      createdAt: '2026-10-04T00:02:00.000Z',
      updatedAt: '2026-10-04T00:02:00.000Z',
    } satisfies ChatMessage;

    mergeCreatedMessage(queryClient, newerMessage, actorUserId);
    mergeCreatedMessage(queryClient, lateOlderMessage, actorUserId);
    mergeCreatedMessage(queryClient, lateOlderMessage, actorUserId);

    const history = queryClient.getQueryData<MessageHistory>(
      messageHistoryQueryKey,
    );
    expect(history?.pages[0]?.items.map(({ id }) => id)).toEqual([
      olderMessage.id,
      lateOlderMessage.id,
      newerMessage.id,
    ]);

    const conversations = queryClient.getQueryData<ChatConversationList>(
      getChatControllerListConversationsQueryKey(),
    );
    expect(conversations?.items[0]?.latestMessage?.id).toBe(newerMessage.id);
    expect(conversations?.items[0]?.updatedAt).toBe(newerMessage.createdAt);
    expect(conversations?.items[0]?.unreadCount).toBe(3);
  });
});

function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { gcTime: Infinity, retry: false },
      mutations: { retry: false },
    },
  });
}

function seedConversationList(
  queryClient: QueryClient,
  value: ChatConversation = {
    ...conversation,
    unreadCount: 1,
  },
): void {
  queryClient.setQueryData<ChatConversationList>(
    getChatControllerListConversationsQueryKey(),
    { items: [value] },
  );
}

function seedMessageHistory(queryClient: QueryClient): void {
  queryClient.setQueryData<MessageHistory>(messageHistoryQueryKey, {
    pages: [{ items: [olderMessage], nextCursor: null }],
    pageParams: [undefined],
  });
}
