import {
  type ChatControllerListConversations200ItemsItem,
  type ChatControllerListConversationsQueryResult,
  type ChatControllerListMessages200ItemsItem,
  type ChatControllerListMessagesQueryResult,
  getChatControllerListConversationsQueryKey,
  getChatControllerListMessagesQueryKey,
} from '@monorepo-erp/api-client';
import {
  getConversationDisplay,
  getProblemDetail,
} from '@core/features/chat/chat-presenter';
import {
  mergeCreatedMessage,
  mergeUpdatedMessage,
} from '@core/features/chat/chat-query';

import { describe, expect, it } from '@jest/globals';
import { type InfiniteData, QueryClient } from '@tanstack/react-query';

const conversationId = '11111111-1111-4111-8111-111111111111';
const actorUserId = 'actor-user';
const peerUserId = 'peer-user';

const conversation: ChatControllerListConversations200ItemsItem = {
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

const olderMessage: ChatControllerListMessages200ItemsItem = {
  id: '22222222-2222-4222-8222-222222222222',
  conversationId,
  senderKind: 'user',
  senderUserId: actorUserId,
  contentType: 'text',
  content: { text: '이전 메시지' },
  createdAt: '2026-10-04T00:01:00.000Z',
  updatedAt: '2026-10-04T00:01:00.000Z',
  editedAt: null,
};

const createdMessage: ChatControllerListMessages200ItemsItem = {
  ...olderMessage,
  id: '33333333-3333-4333-8333-333333333333',
  senderUserId: peerUserId,
  content: { text: '새 메시지' },
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

    const history = queryClient.getQueryData<
      InfiniteData<ChatControllerListMessagesQueryResult, unknown>
    >(getChatControllerListMessagesQueryKey(conversationId));
    expect(history?.pages[0]?.data.items.map(({ id }) => id)).toEqual([
      olderMessage.id,
      createdMessage.id,
    ]);

    const conversations =
      queryClient.getQueryData<ChatControllerListConversationsQueryResult>(
        getChatControllerListConversationsQueryKey(),
      );
    expect(conversations?.data.items[0]?.unreadCount).toBe(2);
    expect(conversations?.data.items[0]?.latestMessage?.id).toBe(
      createdMessage.id,
    );
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
      content: { text: '수정된 메시지' },
      editedAt: '2026-10-04T00:03:00.000Z',
      updatedAt: '2026-10-04T00:03:00.000Z',
    } satisfies ChatControllerListMessages200ItemsItem;

    mergeUpdatedMessage(queryClient, updatedMessage);

    const history = queryClient.getQueryData<
      InfiniteData<ChatControllerListMessagesQueryResult, unknown>
    >(getChatControllerListMessagesQueryKey(conversationId));
    expect(history?.pages[0]?.data.items[0]?.content.text).toBe(
      '수정된 메시지',
    );

    const conversations =
      queryClient.getQueryData<ChatControllerListConversationsQueryResult>(
        getChatControllerListConversationsQueryKey(),
      );
    expect(conversations?.data.items[0]?.latestMessage?.content.text).toBe(
      '수정된 메시지',
    );
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
    } satisfies ChatControllerListMessages200ItemsItem;
    const lateOlderMessage = {
      ...createdMessage,
      id: '44444444-4444-4444-8444-444444444444',
      createdAt: '2026-10-04T00:02:00.000Z',
      updatedAt: '2026-10-04T00:02:00.000Z',
    } satisfies ChatControllerListMessages200ItemsItem;

    mergeCreatedMessage(queryClient, newerMessage, actorUserId);
    mergeCreatedMessage(queryClient, lateOlderMessage, actorUserId);
    mergeCreatedMessage(queryClient, lateOlderMessage, actorUserId);

    const history = queryClient.getQueryData<
      InfiniteData<ChatControllerListMessagesQueryResult, unknown>
    >(getChatControllerListMessagesQueryKey(conversationId));
    expect(history?.pages[0]?.data.items.map(({ id }) => id)).toEqual([
      olderMessage.id,
      lateOlderMessage.id,
      newerMessage.id,
    ]);

    const conversations =
      queryClient.getQueryData<ChatControllerListConversationsQueryResult>(
        getChatControllerListConversationsQueryKey(),
      );
    expect(conversations?.data.items[0]?.latestMessage?.id).toBe(
      newerMessage.id,
    );
    expect(conversations?.data.items[0]?.updatedAt).toBe(
      newerMessage.createdAt,
    );
    expect(conversations?.data.items[0]?.unreadCount).toBe(3);
  });
});

describe('채팅 표시 규칙', () => {
  it('다이렉트 메시지 제목은 현재 사용자가 아니라 상대방을 표시한다', () => {
    expect(getConversationDisplay(conversation, actorUserId)).toMatchObject({
      title: '상대방',
      subtitle: '@peer',
    });
  });

  it('상대가 사라진 다이렉트 메시지를 현재 사용자 이름으로 오인하지 않는다', () => {
    expect(
      getConversationDisplay(
        { ...conversation, participants: [conversation.participants[0]!] },
        actorUserId,
      ),
    ).toMatchObject({
      title: '대화 상대 없음',
    });
  });

  it('시스템 대화를 다이렉트 메시지로 오인하지 않는다', () => {
    expect(
      getConversationDisplay(
        {
          ...conversation,
          kind: 'system',
          name: null,
          topic: null,
          participants: [conversation.participants[0]!],
        },
        actorUserId,
      ),
    ).toEqual({
      title: '시스템',
      subtitle: '시스템 알림과 메시지',
      image: null,
    });
  });

  it('API 런타임 오류의 info 안에 있는 Problem Details 상세 내용을 읽는다', () => {
    expect(
      getProblemDetail({
        status: 409,
        info: { detail: '이미 존재하는 대화입니다.' },
      }),
    ).toBe('이미 존재하는 대화입니다.');
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
  value: ChatControllerListConversations200ItemsItem = {
    ...conversation,
    unreadCount: 1,
  },
): void {
  queryClient.setQueryData<ChatControllerListConversationsQueryResult>(
    getChatControllerListConversationsQueryKey(),
    {
      data: { items: [value] },
      status: 200,
      headers: new Headers(),
    },
  );
}

function seedMessageHistory(queryClient: QueryClient): void {
  queryClient.setQueryData<
    InfiniteData<ChatControllerListMessagesQueryResult, unknown>
  >(getChatControllerListMessagesQueryKey(conversationId), {
    pages: [
      {
        data: { items: [olderMessage], nextCursor: null },
        status: 200,
        headers: new Headers(),
      },
    ],
    pageParams: [null],
  });
}
