import { memo } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { Button } from '@repo/client/rnr/components/ui/button';
import { Icon } from '@repo/client/rnr/components/ui/icon';
import { Text } from '@repo/client/rnr/components/ui/text';
import { getConversationDisplay } from '@core/features/chat/chat-presenter';
import { useChatConversationHeader } from '@core/features/chat/chat-query';

import { Bell, Hash, List, MessageSquare } from 'lucide-react-native';

export function ChatConversationHeaderFallback() {
  return (
    <View className="min-h-16 shrink-0 items-center justify-center border-b border-border px-4 py-3">
      <ActivityIndicator size="small" />
    </View>
  );
}

export const ChatConversationHeader = memo(function ChatConversationHeader({
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
              <Text className="text-2xs font-medium text-muted-foreground">
                {conversation.participants.length}명
              </Text>
            </View>
          </View>
          <Text className="truncate text-xs text-muted-foreground">
            {display.subtitle || '대화를 시작해 보세요.'}
          </Text>
        </View>
      </View>
    </View>
  );
});
