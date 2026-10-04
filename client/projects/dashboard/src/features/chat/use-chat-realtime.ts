import { useEffect } from 'react';

import type { ChatControllerListMessages200ItemsItem } from '@monorepo-erp/api-client';
import { streamServerSentEvents } from '@monorepo-erp/api-client/sse';
import {
  mergeCreatedMessage,
  mergeUpdatedMessage,
  refreshChatAfterReconnect,
  refreshConversationMetadata,
} from '@core/features/chat/chat-query';

import { useQueryClient } from '@tanstack/react-query';

type ChatRealtimeEvent =
  | {
      type: 'message.created' | 'message.updated';
      conversationId: string;
      message: ChatControllerListMessages200ItemsItem;
    }
  | {
      type: 'conversation.read';
      conversationId: string;
      userId: string;
      readAt: string;
    }
  | {
      type: 'conversation.changed';
      conversationId: string;
    };

type UseChatRealtimeInput = {
  currentUserId: string | null;
  enabled: boolean;
};

export function useChatRealtime({
  currentUserId,
  enabled,
}: UseChatRealtimeInput): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!enabled || !currentUserId) {
      return;
    }

    const controller = new AbortController();

    void streamServerSentEvents({
      path: '/chat/events',
      signal: controller.signal,
      onEvent: async (serverEvent) => {
        if (serverEvent.event === 'heartbeat') {
          return;
        }

        const event = parseChatRealtimeEvent(serverEvent.data);
        if (!event) {
          return;
        }

        switch (event.type) {
          case 'message.created':
            mergeCreatedMessage(queryClient, event.message, currentUserId);
            return;
          case 'message.updated':
            mergeUpdatedMessage(queryClient, event.message);
            return;
          case 'conversation.read':
            if (event.userId === currentUserId) {
              await refreshConversationMetadata(
                queryClient,
                event.conversationId,
              );
            }
            return;
          case 'conversation.changed':
            await refreshConversationMetadata(
              queryClient,
              event.conversationId,
            );
        }
      },
      onReconnect: () => refreshChatAfterReconnect(queryClient),
      onError: (error) => {
        if (__DEV__) {
          console.warn('채팅 실시간 처리 중 오류가 발생했습니다.', error);
        }
      },
    });

    return () => controller.abort();
  }, [currentUserId, enabled, queryClient]);
}

function parseChatRealtimeEvent(data: string): ChatRealtimeEvent | null {
  try {
    const payload: unknown = JSON.parse(data);
    if (
      !isRecord(payload) ||
      typeof payload.type !== 'string' ||
      typeof payload.conversationId !== 'string'
    ) {
      return null;
    }

    if (
      (payload.type === 'message.created' ||
        payload.type === 'message.updated') &&
      isChatMessage(payload.message) &&
      payload.message.conversationId === payload.conversationId
    ) {
      return {
        type: payload.type,
        conversationId: payload.conversationId,
        message: payload.message,
      };
    }

    if (
      payload.type === 'conversation.read' &&
      typeof payload.userId === 'string' &&
      typeof payload.readAt === 'string'
    ) {
      return {
        type: payload.type,
        conversationId: payload.conversationId,
        userId: payload.userId,
        readAt: payload.readAt,
      };
    }

    if (payload.type === 'conversation.changed') {
      return {
        type: payload.type,
        conversationId: payload.conversationId,
      };
    }

    return null;
  } catch {
    return null;
  }
}

function isChatMessage(
  value: unknown,
): value is ChatControllerListMessages200ItemsItem {
  if (!isRecord(value) || !isRecord(value.content)) {
    return false;
  }

  return (
    typeof value.id === 'string' &&
    typeof value.conversationId === 'string' &&
    (value.senderKind === 'system' || value.senderKind === 'user') &&
    (value.senderUserId === null || typeof value.senderUserId === 'string') &&
    value.contentType === 'text' &&
    typeof value.content.text === 'string' &&
    typeof value.createdAt === 'string' &&
    typeof value.updatedAt === 'string' &&
    (value.editedAt === null || typeof value.editedAt === 'string')
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
