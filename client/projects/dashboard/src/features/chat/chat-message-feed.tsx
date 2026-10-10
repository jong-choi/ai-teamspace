import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
} from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';

import { Text } from '@repo/client/rnr/components/ui/text';
import { useDashboardPlatform } from '@core/app/platform/dashboard-platform';
import { flattenChatMessageHistory } from '@core/features/chat/chat-message-history';
import { ChatMessageRow } from '@core/features/chat/chat-message-row';
import { getCanonicalMessagePath } from '@core/features/chat/chat-presenter';
import {
  useChatConversationParticipants,
  useChatMessageHistory,
} from '@core/features/chat/chat-query';
import { ChatState } from '@core/features/chat/chat-state';

import { LegendList, type LegendListRef } from '@legendapp/list/react-native';

export function ChatMessageFeed({
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
  const latestMessageId = messages.at(-1)?.id;
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
  const openInvitation = useCallback(
    (invitationId: string) => {
      router.push({
        pathname: '/invitations/[invitationId]',
        params: { invitationId },
      });
    },
    [router],
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

  // 새 메시지가 오면 보던 위치와 상관없이 맨 아래로 바로 보낸다.
  // 이전 메시지를 더 불러올 때는 마지막 메시지가 그대로라서 움직이지 않는다.
  const shownLatestMessageId = useRef(latestMessageId);
  useLayoutEffect(() => {
    if (shownLatestMessageId.current === latestMessageId) return;
    shownLatestMessageId.current = latestMessageId;
    if (focusedMessageId) return;
    void listRef.current?.scrollToEnd({ animated: false });
  }, [focusedMessageId, latestMessageId]);

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
        // 방을 열면 맨 아래에서 시작한다. 특정 메시지를 가리키는 주소로 왔을 때는 그 메시지로 간다.
        initialScrollAtEnd={!focusedMessageId}
        keyExtractor={(message) => message.id}
        maintainScrollAtEnd
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
            onOpenInvitation={openInvitation}
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
            <Text className="text-2xs text-muted-foreground">
              이전 메시지 불러오는 중...
            </Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}
