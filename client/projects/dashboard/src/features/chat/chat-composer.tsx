import { memo, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { useChatControllerSendMessage } from '@repo/client/api-client';
import { Button } from '@repo/client/rnr/components/ui/button';
import { Icon } from '@repo/client/rnr/components/ui/icon';
import { Input } from '@repo/client/rnr/components/ui/input';
import { Separator } from '@repo/client/rnr/components/ui/separator';
import { Text } from '@repo/client/rnr/components/ui/text';
import { useMutationErrorNotification } from '@core/app/error/use-mutation-error-notification';
import { mergeCreatedMessage } from '@core/features/chat/chat-cache';

import { useQueryClient } from '@tanstack/react-query';
import { Send } from 'lucide-react-native';

export const ChatComposer = memo(function ChatComposer({
  conversationId,
  currentUserId,
}: {
  conversationId: string;
  currentUserId: string;
}) {
  const queryClient = useQueryClient();
  const [text, setText] = useState('');
  const notifySendError = useMutationErrorNotification({
    id: `chat-send-message:${conversationId}`,
    title: '메시지를 보내지 못했습니다',
    fallback: '잠시 후 다시 시도해 주세요.',
  });
  const sendMessage = useChatControllerSendMessage({
    mutation: {
      onError: notifySendError,
      onSuccess: (response) => {
        mergeCreatedMessage(queryClient, response, currentUserId);
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
          <Text className="hidden text-2xs text-muted-foreground sm:flex">
            Enter 전송 · Shift+Enter 줄바꿈
          </Text>
          <View className="ml-auto flex-row items-center gap-2">
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
