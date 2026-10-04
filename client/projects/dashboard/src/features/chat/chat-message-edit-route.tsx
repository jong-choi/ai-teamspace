import { useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useRouter } from 'expo-router';

import { useChatControllerUpdateMessage } from '@repo/client/api-client';
import { Button } from '@repo/client/rnr/components/ui/button';
import { Icon } from '@repo/client/rnr/components/ui/icon';
import { Input } from '@repo/client/rnr/components/ui/input';
import { Text } from '@repo/client/rnr/components/ui/text';
import { useMutationErrorNotification } from '@core/app/error/use-mutation-error-notification';
import { useDashboardPlatform } from '@core/app/platform/dashboard-platform';
import { DashboardShell } from '@core/app/shell/dashboard-shell';
import { mergeUpdatedMessage } from '@core/features/chat/chat-cache';
import { ChatMessageRouteHeader } from '@core/features/chat/chat-message-route-header';
import { useChatMessage } from '@core/features/chat/chat-query';
import {
  ChatLoading,
  ChatQueryBoundary,
  ChatState,
} from '@core/features/chat/chat-state';

import { useQueryClient } from '@tanstack/react-query';
import { Send } from 'lucide-react-native';

type ChatMessageEditRouteProps = {
  conversationId: string;
  messageId: string;
};

export function ChatMessageEditRoute(props: ChatMessageEditRouteProps) {
  const { currentUserId, sessionPending } = useDashboardPlatform();

  return (
    <DashboardShell>
      {sessionPending ? (
        <ChatLoading label="세션을 확인하는 중..." />
      ) : !currentUserId ? (
        <ChatState
          title="로그인이 필요합니다"
          description="메시지를 수정하려면 먼저 로그인해 주세요."
        />
      ) : (
        <ChatQueryBoundary
          fallback={<ChatLoading label="메시지를 불러오는 중..." />}
          resetKeys={[props.conversationId, props.messageId]}
          title="메시지를 불러오지 못했습니다"
        >
          <ChatMessageEditContent {...props} currentUserId={currentUserId} />
        </ChatQueryBoundary>
      )}
    </DashboardShell>
  );
}

function ChatMessageEditContent({
  conversationId,
  currentUserId,
  messageId,
}: ChatMessageEditRouteProps & { currentUserId: string }) {
  const router = useRouter();
  const message = useChatMessage(conversationId, messageId).data;
  const canEdit =
    message.senderKind === 'user' &&
    message.senderUserId === currentUserId &&
    message.contentType === 'text';

  return (
    <View className="min-h-0 flex-1 bg-background">
      <ChatMessageRouteHeader
        description="본인이 작성한 일반 텍스트 메시지만 수정할 수 있습니다."
        onBack={() => router.back()}
        title="메시지 수정"
      />

      {!canEdit ? (
        <ChatState
          title="수정할 수 없는 메시지입니다"
          description="본인이 작성한 일반 텍스트 메시지만 수정할 수 있습니다."
        />
      ) : (
        <MessageEditor
          key={message.id}
          conversationId={conversationId}
          initialText={message.content.text}
          messageId={messageId}
          onCancel={() => router.back()}
          onSaved={() =>
            router.replace({
              pathname: '/chat/[conversationId]/messages/[messageId]',
              params: { conversationId, messageId },
            })
          }
        />
      )}
    </View>
  );
}

function MessageEditor({
  conversationId,
  initialText,
  messageId,
  onCancel,
  onSaved,
}: {
  conversationId: string;
  initialText: string;
  messageId: string;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const queryClient = useQueryClient();
  const [text, setText] = useState(initialText);
  const normalizedText = text.trim();
  const changed = normalizedText !== initialText;
  const notifyUpdateError = useMutationErrorNotification({
    id: `chat-update-message:${messageId}`,
    title: '메시지를 수정하지 못했습니다',
    fallback: '잠시 후 다시 시도해 주세요.',
  });
  const updateMessage = useChatControllerUpdateMessage({
    mutation: {
      onError: notifyUpdateError,
      onSuccess: (response) => {
        mergeUpdatedMessage(queryClient, response);
        onSaved();
      },
    },
  });

  const submit = () => {
    if (!normalizedText || !changed || updateMessage.isPending) {
      return;
    }

    updateMessage.mutate({
      conversationId,
      messageId,
      data: { text: normalizedText },
    });
  };

  return (
    <View className="flex-1 items-center justify-center px-4 py-8 sm:px-8">
      <View className="w-full max-w-2xl gap-3">
        <Input
          className="min-h-32 items-start py-3"
          editable={!updateMessage.isPending}
          multiline
          onChangeText={setText}
          placeholder="메시지 내용을 입력하세요"
          value={text}
        />
        <View className="flex-row justify-end gap-2">
          <Button
            disabled={updateMessage.isPending}
            onPress={onCancel}
            variant="outline"
          >
            <Text>취소</Text>
          </Button>
          <Button
            disabled={!normalizedText || !changed || updateMessage.isPending}
            onPress={submit}
          >
            {updateMessage.isPending ? (
              <ActivityIndicator size="small" />
            ) : (
              <>
                <Text className="text-primary-foreground">저장</Text>
                <Icon
                  as={Send}
                  className="ml-2 size-3.5 text-primary-foreground"
                />
              </>
            )}
          </Button>
        </View>
      </View>
    </View>
  );
}
