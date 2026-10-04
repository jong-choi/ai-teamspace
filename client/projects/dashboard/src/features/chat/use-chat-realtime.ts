import { useEffect } from 'react';

import { ChatRealtimeEvent } from '@monorepo-erp/api-client/schemas';
import { streamServerSentEvents } from '@monorepo-erp/api-client/sse';
import {
  mergeCreatedMessage,
  mergeUpdatedMessage,
  refreshChatAfterReconnect,
  refreshConversationMetadata,
} from '@core/features/chat/chat-query';

import { useQueryClient } from '@tanstack/react-query';

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

function parseChatRealtimeEvent(data: string) {
  try {
    const result = ChatRealtimeEvent.safeParse(JSON.parse(data));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}
