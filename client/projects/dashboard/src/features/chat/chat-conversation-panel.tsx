import { View } from 'react-native';

import { ChatComposer } from '@core/features/chat/chat-composer';
import {
  ChatConversationHeader,
  ChatConversationHeaderFallback,
} from '@core/features/chat/chat-conversation-header';
import { ChatMessageFeed } from '@core/features/chat/chat-message-feed';
import { ChatReadSync } from '@core/features/chat/chat-read-sync';
import { ChatLoading, ChatQueryBoundary } from '@core/features/chat/chat-state';

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
      <ChatQueryBoundary
        errorFallbackClassName="min-h-16 border-b border-border py-3"
        fallback={<ChatConversationHeaderFallback />}
        resetKeys={[conversationId]}
        title="대화 정보를 불러오지 못했습니다"
      >
        <ChatConversationHeader
          conversationId={conversationId}
          currentUserId={currentUserId}
          onOpenChannelDrawer={onOpenChannelDrawer}
        />
        <ChatReadSync conversationId={conversationId} />
      </ChatQueryBoundary>
      <ChatQueryBoundary
        fallback={<ChatLoading label="메시지를 불러오는 중..." />}
        resetKeys={[conversationId]}
        title="메시지를 불러오지 못했습니다"
      >
        <ChatMessageFeed
          conversationId={conversationId}
          currentUserId={currentUserId}
          focusedMessageId={focusedMessageId}
        />
      </ChatQueryBoundary>
      <ChatComposer
        conversationId={conversationId}
        currentUserId={currentUserId}
      />
    </View>
  );
}
