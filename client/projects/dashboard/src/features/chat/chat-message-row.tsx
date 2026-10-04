import { memo } from 'react';
import { View } from 'react-native';

import type { ChatMessage } from '@repo/client/api-client/schemas';
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from '@repo/client/rnr/components/ui/avatar';
import { Button } from '@repo/client/rnr/components/ui/button';
import { Icon } from '@repo/client/rnr/components/ui/icon';
import { Text } from '@repo/client/rnr/components/ui/text';
import { cn } from '@repo/client/rnr/lib/utils';
import {
  type ChatParticipantDisplay,
  formatMessageTime,
} from '@core/features/chat/chat-presenter';

import { Link2, Pencil } from 'lucide-react-native';

type ChatMessageRowProps = {
  currentUserId: string;
  focused: boolean;
  message: ChatMessage;
  sender?: ChatParticipantDisplay;
  onCopyCanonical: (messageId: string) => void;
  onEdit: (messageId: string) => void;
};

export const ChatMessageRow = memo(function ChatMessageRow({
  currentUserId,
  focused,
  message,
  sender,
  onCopyCanonical,
  onEdit,
}: ChatMessageRowProps) {
  const mine =
    message.senderKind === 'user' && message.senderUserId === currentUserId;
  const senderName =
    sender?.name ??
    (message.senderKind === 'system' ? '시스템' : '알 수 없는 사용자');

  return (
    <View
      className={cn(
        'mb-1 flex-row items-start gap-3 rounded-xl p-3 web:hover:bg-muted/50',
        focused && 'border border-emerald-500/30 bg-emerald-500/5',
      )}
    >
      <Avatar alt={senderName} className="size-8">
        {sender?.image ? <AvatarImage source={{ uri: sender.image }} /> : null}
        <AvatarFallback>
          <Text className="text-xs font-semibold">
            {senderName.slice(0, 1).toUpperCase()}
          </Text>
        </AvatarFallback>
      </Avatar>
      <View className="min-w-0 flex-1">
        <View className="mb-1 flex-row flex-wrap items-center gap-2">
          <Text className="text-xs font-semibold">{senderName}</Text>
          {mine ? (
            <View className="rounded bg-muted px-1.5 py-0.5">
              <Text className="text-[10px] font-semibold text-muted-foreground">
                내 메시지
              </Text>
            </View>
          ) : null}
          <Text className="font-mono text-[10px] text-muted-foreground">
            {formatMessageTime(message.createdAt)}
          </Text>
          {message.editedAt ? (
            <Text className="text-[10px] text-muted-foreground">수정됨</Text>
          ) : null}
        </View>
        <Text className="text-xs leading-5 text-foreground/90">
          {message.content.text}
        </Text>
      </View>
      <View className="shrink-0 flex-row items-center gap-0.5">
        {mine && message.contentType === 'text' ? (
          <Button
            accessibilityLabel="메시지 수정"
            className="h-7 w-7"
            onPress={() => onEdit(message.id)}
            size="icon"
            variant="ghost"
          >
            <Icon as={Pencil} className="size-3.5 text-muted-foreground" />
          </Button>
        ) : null}
        <Button
          accessibilityLabel="메시지 링크 복사"
          className="h-7 w-7"
          onPress={() => onCopyCanonical(message.id)}
          size="icon"
          variant="ghost"
        >
          <Icon as={Link2} className="size-3.5 text-muted-foreground" />
        </Button>
      </View>
    </View>
  );
});
