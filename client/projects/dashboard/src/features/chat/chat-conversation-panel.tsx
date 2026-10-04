import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, AppState, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';

import {
  useChatControllerMarkRead,
  useChatControllerSendMessage,
} from '@monorepo-erp/api-client';
import { useDashboardPlatform } from '@core/app/platform/dashboard-platform';
import { ChatMessageRow } from '@core/features/chat/chat-message-row';
import {
  getCanonicalMessagePath,
  getConversationDisplay,
  getProblemDetail,
} from '@core/features/chat/chat-presenter';
import {
  flattenChatMessageHistory,
  mergeCreatedMessage,
  refreshConversationMetadata,
  useChatConversationHeader,
  useChatConversationParticipants,
  useChatConversationReadState,
  useChatMessageHistory,
} from '@core/features/chat/chat-query';
import { ChatState } from '@core/features/chat/chat-state';
import { Button } from '@repo/client/rnr/components/ui/button';
import { Icon } from '@repo/client/rnr/components/ui/icon';
import { Input } from '@repo/client/rnr/components/ui/input';
import { Separator } from '@repo/client/rnr/components/ui/separator';
import { Text } from '@repo/client/rnr/components/ui/text';

import { LegendList, type LegendListRef } from '@legendapp/list/react-native';
import { useQueryClient } from '@tanstack/react-query';
import { Bell, Hash, List, MessageSquare, Send } from 'lucide-react-native';

type ChatConversationPanelProps = {
  conversationId: string;
  currentUserId: string;
  focusedMessageId?: string;
  onOpenChannelDrawer: () => void;
};

export function ChatConversationPanel({
  conversationId,
  currentUserId,
  focusedMessageId,
  onOpenChannelDrawer,
}: ChatConversationPanelProps) {
  return (
    <View className="min-h-0 flex-1 bg-background">
      <ConversationHeader
        conversationId={conversationId}
        currentUserId={currentUserId}
        onOpenChannelDrawer={onOpenChannelDrawer}
      />
      <ChatMessageFeed
        conversationId={conversationId}
        currentUserId={currentUserId}
        focusedMessageId={focusedMessageId}
      />
      <ChatComposer
        conversationId={conversationId}
        currentUserId={currentUserId}
      />
      <ConversationReadSync conversationId={conversationId} />
    </View>
  );
}

const ConversationHeader = memo(function ConversationHeader({
  conversationId,
  currentUserId,
  onOpenChannelDrawer,
}: {
  conversationId: string;
  currentUserId: string;
  onOpenChannelDrawer: () => void;
}) {
  const conversation = useChatConversationHeader(conversationId).data;
  const display = getConversationDisplay(conversation, currentUserId);
  const ConversationIcon =
    conversation.kind === 'channel'
      ? Hash
      : conversation.kind === 'system'
        ? Bell
        : MessageSquare;

  return (
    <View className="shrink-0 flex-row items-center justify-between gap-3 border-b border-border bg-background/95 px-4 py-3 sm:px-5">
      <View className="min-w-0 flex-1 flex-row items-center gap-2.5">
        <Button
          accessibilityLabel="채널 목록 열기"
          className="h-8 w-8 md:hidden"
          onPress={onOpenChannelDrawer}
          size="icon"
          variant="ghost"
        >
          <Icon as={List} className="size-4 text-muted-foreground" />
        </Button>
        <View className="size-7 shrink-0 items-center justify-center rounded-md bg-muted">
          <Icon
            as={ConversationIcon}
            className="size-4 text-muted-foreground"
          />
        </View>
        <View className="min-w-0 flex-1">
          <View className="flex-row items-center gap-2">
            <Text className="truncate text-sm font-bold">{display.title}</Text>
            <View className="rounded bg-muted px-1.5 py-0.5">
              <Text className="text-[10px] font-medium text-muted-foreground">
                {conversation.participants.length}명
              </Text>
            </View>
          </View>
          <Text className="truncate text-[11px] text-muted-foreground">
            {display.subtitle || '대화를 시작해 보세요.'}
          </Text>
        </View>
      </View>
    </View>
  );
});

function ChatMessageFeed({
  conversationId,
  currentUserId,
  focusedMessageId,
}: {
  conversationId: string;
  currentUserId: string;
  focusedMessageId?: string;
}) {
  const router = useRouter();
  const { copyText, createAppUrl } = useDashboardPlatform();
  const listRef = useRef<LegendListRef>(null);
  const participants = useChatConversationParticipants(conversationId).data;
  const participantsById = useMemo(
    () =>
      new Map(
        participants.map((participant) => [participant.userId, participant]),
      ),
    [participants],
  );
  const messagesQuery = useChatMessageHistory(conversationId);
  const messages = useMemo(
    () => flattenChatMessageHistory(messagesQuery.data),
    [messagesQuery.data],
  );
  const focusedIndex = focusedMessageId
    ? messages.findIndex(({ id }) => id === focusedMessageId)
    : -1;

  const copyCanonical = useCallback(
    (messageId: string) => {
      void copyText(
        createAppUrl(getCanonicalMessagePath(conversationId, messageId)),
      );
    },
    [conversationId, copyText, createAppUrl],
  );
  const editMessage = useCallback(
    (messageId: string) => {
      router.push({
        pathname: '/chat/[conversationId]/messages/[messageId]/edit',
        params: { conversationId, messageId },
      });
    },
    [conversationId, router],
  );

  useEffect(() => {
    if (!focusedMessageId) {
      return;
    }

    if (focusedIndex >= 0) {
      listRef.current?.scrollToIndex({
        animated: true,
        index: focusedIndex,
        viewPosition: 0.5,
      });
      return;
    }

    if (messagesQuery.hasNextPage && !messagesQuery.isFetchingNextPage) {
      void messagesQuery.fetchNextPage();
    }
  }, [
    focusedIndex,
    focusedMessageId,
    messagesQuery.fetchNextPage,
    messagesQuery.hasNextPage,
    messagesQuery.isFetchingNextPage,
  ]);

  if (messages.length === 0) {
    return (
      <View className="min-h-0 flex-1">
        <ChatState
          title="첫 메시지를 남겨보세요"
          description="이 대화의 참가자에게 실시간으로 전달됩니다."
        />
      </View>
    );
  }

  return (
    <View className="min-h-0 flex-1">
      <LegendList
        ref={listRef}
        alignItemsAtEnd
        contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 16 }}
        data={messages}
        extraData={focusedMessageId}
        keyExtractor={(message) => message.id}
        maintainScrollAtEnd={{ animated: true }}
        maintainVisibleContentPosition={{ data: true }}
        onStartReached={() => {
          if (messagesQuery.hasNextPage && !messagesQuery.isFetchingNextPage) {
            void messagesQuery.fetchNextPage();
          }
        }}
        onStartReachedThreshold={0.25}
        recycleItems
        renderItem={({ item }) => (
          <ChatMessageRow
            currentUserId={currentUserId}
            focused={item.id === focusedMessageId}
            message={item}
            onCopyCanonical={copyCanonical}
            onEdit={editMessage}
            sender={
              item.senderUserId
                ? participantsById.get(item.senderUserId)
                : undefined
            }
          />
        )}
      />
      {messagesQuery.isFetchingNextPage ? (
        <View className="absolute left-0 right-0 top-2 items-center">
          <View className="rounded-full border border-border bg-background px-3 py-1 shadow-sm">
            <Text className="text-[10px] text-muted-foreground">
              이전 메시지 불러오는 중...
            </Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const ChatComposer = memo(function ChatComposer({
  conversationId,
  currentUserId,
}: {
  conversationId: string;
  currentUserId: string;
}) {
  const queryClient = useQueryClient();
  const [text, setText] = useState('');
  const sendMessage = useChatControllerSendMessage({
    mutation: {
      onSuccess: (response) => {
        mergeCreatedMessage(queryClient, response.data, currentUserId);
        setText('');
      },
    },
  });

  const submit = () => {
    const message = text.trim();
    if (!message || sendMessage.isPending) {
      return;
    }

    sendMessage.mutate({
      conversationId,
      data: { text: message },
    });
  };

  return (
    <View className="shrink-0 border-t border-border bg-background/95 p-3 sm:p-4">
      <View className="rounded-xl border border-border bg-muted/40 shadow-sm">
        <Input
          className="min-h-14 border-0 bg-transparent px-3.5 py-2.5 text-xs shadow-none web:focus-visible:ring-0"
          editable={!sendMessage.isPending}
          multiline
          onChangeText={setText}
          onSubmitEditing={submit}
          placeholder="메시지를 입력하세요..."
          submitBehavior="submit"
          value={text}
        />
        <Separator />
        <View className="flex-row items-center justify-between px-3 py-2">
          <Text className="hidden text-[10px] text-muted-foreground sm:flex">
            Enter 전송 · Shift+Enter 줄바꿈
          </Text>
          <View className="ml-auto flex-row items-center gap-2">
            {sendMessage.isError ? (
              <Text className="text-[10px] text-destructive">
                {getProblemDetail(sendMessage.error) ?? '전송하지 못했습니다.'}
              </Text>
            ) : null}
            <Button
              className="h-8 gap-1.5 px-3"
              disabled={!text.trim() || sendMessage.isPending}
              onPress={submit}
              size="sm"
            >
              {sendMessage.isPending ? (
                <ActivityIndicator size="small" />
              ) : (
                <>
                  <Text className="text-xs text-primary-foreground">전송</Text>
                  <Icon as={Send} className="size-3 text-primary-foreground" />
                </>
              )}
            </Button>
          </View>
        </View>
      </View>
    </View>
  );
});

function ConversationReadSync({ conversationId }: { conversationId: string }) {
  const queryClient = useQueryClient();
  const conversation = useChatConversationReadState(conversationId).data;
  const attemptedMessageId = useRef<string | null>(null);
  const [routeFocused, setRouteFocused] = useState(false);
  const [appActive, setAppActive] = useState(
    AppState.currentState === 'active',
  );
  const markRead = useChatControllerMarkRead({
    mutation: {
      retry: 1,
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
