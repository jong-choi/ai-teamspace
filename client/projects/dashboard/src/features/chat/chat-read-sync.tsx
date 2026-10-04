import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';

import { useChatControllerMarkRead } from '@repo/client/api-client';
import { useMutationErrorNotification } from '@core/app/error/use-mutation-error-notification';
import { refreshConversationMetadata } from '@core/features/chat/chat-cache';
import { useChatConversationReadState } from '@core/features/chat/chat-query';

import { useQueryClient } from '@tanstack/react-query';

export function ChatReadSync({ conversationId }: { conversationId: string }) {
  const queryClient = useQueryClient();
  const conversation = useChatConversationReadState(conversationId).data;
  const notifyReadError = useMutationErrorNotification({
    id: `chat-mark-read:${conversationId}`,
    title: '읽음 상태를 저장하지 못했습니다',
    fallback: '잠시 후 다시 시도해 주세요.',
  });
  const attemptedMessageId = useRef<string | null>(null);
  const [routeFocused, setRouteFocused] = useState(false);
  const [appActive, setAppActive] = useState(
    AppState.currentState === 'active',
  );
  const markRead = useChatControllerMarkRead({
    mutation: {
      retry: 1,
      onError: notifyReadError,
      onSuccess: () => refreshConversationMetadata(queryClient, conversationId),
    },
  });
  const latestMessageId = conversation.latestMessage?.id ?? null;

  useFocusEffect(
    useCallback(() => {
      setRouteFocused(true);
      return () => setRouteFocused(false);
    }, []),
  );

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      setAppActive(state === 'active');
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (!routeFocused || !appActive || conversation.unreadCount <= 0) {
      attemptedMessageId.current = null;
      return;
    }
    if (
      !latestMessageId ||
      markRead.isPending ||
      attemptedMessageId.current === latestMessageId
    ) {
      return;
    }

    attemptedMessageId.current = latestMessageId;
    markRead.mutate({
      conversationId,
      data: { messageId: latestMessageId },
    });
  }, [
    appActive,
    conversation.unreadCount,
    conversationId,
    latestMessageId,
    markRead.isPending,
    markRead.mutate,
    routeFocused,
  ]);

  return null;
}
