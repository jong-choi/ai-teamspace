import { Suspense, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useRouter } from 'expo-router';

import { useChatControllerUpdateMessage } from '@monorepo-erp/api-client';
import { useDashboardPlatform } from '@core/app/platform/dashboard-platform';
import { DashboardShell } from '@core/app/shell/dashboard-shell';
import {
  formatMessageDateTime,
  getCanonicalMessagePath,
  getProblemDetail,
} from '@core/features/chat/chat-presenter';
import {
  mergeUpdatedMessage,
  useChatConversationParticipants,
  useChatMessage,
} from '@core/features/chat/chat-query';
import {
  ChatErrorBoundary,
  ChatLoading,
  ChatState,
} from '@core/features/chat/chat-state';
import { Button } from '@repo/client/rnr/components/ui/button';
import { Icon } from '@repo/client/rnr/components/ui/icon';
import { Input } from '@repo/client/rnr/components/ui/input';
import { Text } from '@repo/client/rnr/components/ui/text';

import { useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Link2,
  MessageSquareText,
  Pencil,
  Send,
} from 'lucide-react-native';

type ChatMessageRouteProps = {
  conversationId: string;
  messageId: string;
};

export function ChatMessageDetailRoute(props: ChatMessageRouteProps) {
  const { currentUserId, sessionPending } = useDashboardPlatform();

  return (
    <DashboardShell>
      {sessionPending ? (
        <ChatLoading label="세션을 확인하는 중..." />
      ) : !currentUserId ? (
        <ChatState
          title="로그인이 필요합니다"
          description="메시지를 보려면 먼저 로그인해 주세요."
        />
      ) : (
        <ChatErrorBoundary
          key={`${props.conversationId}:${props.messageId}:detail`}
        >
          <Suspense fallback={<ChatLoading label="메시지를 불러오는 중..." />}>
            <ChatMessageDetailContent
              {...props}
              currentUserId={currentUserId}
            />
          </Suspense>
        </ChatErrorBoundary>
      )}
    </DashboardShell>
  );
}

function ChatMessageDetailContent({
  conversationId,
  currentUserId,
  messageId,
}: ChatMessageRouteProps & { currentUserId: string }) {
  const router = useRouter();
  const { copyText, createAppUrl } = useDashboardPlatform();
  const message = useChatMessage(conversationId, messageId).data;
  const participants = useChatConversationParticipants(conversationId).data;
  const sender = participants.find(
    (participant) => participant.userId === message.senderUserId,
  );
  const canEdit =
    message.senderKind === 'user' &&
    message.senderUserId === currentUserId &&
    message.contentType === 'text';

  return (
    <View className="min-h-0 flex-1 bg-background">
      <MessageRouteHeader
        description={`안정적인 메시지 링크 · ${messageId}`}
        onBack={() => router.back()}
        title="메시지 상세"
      />

      <View className="flex-1 items-center justify-center px-4 py-8 sm:px-8">
        <View className="w-full max-w-2xl gap-5">
          <View className="gap-1 border-b border-border pb-4">
            <View className="flex-row items-center gap-2">
              <Icon
                as={MessageSquareText}
                className="size-4 text-muted-foreground"
              />
              <Text className="text-xs font-semibold">
                {sender?.name ??
                  (message.senderKind === 'system'
                    ? '시스템'
                    : '알 수 없는 사용자')}
              </Text>
              {sender?.username ? (
                <Text className="text-[10px] text-muted-foreground">
                  @{sender.username}
                </Text>
              ) : null}
            </View>
            <Text className="font-mono text-[10px] text-muted-foreground">
              {formatMessageDateTime(message.createdAt)}
              {message.editedAt ? ' · 수정됨' : ''}
            </Text>
          </View>

          <Text className="text-sm leading-6 text-foreground/90">
            {message.content.text}
          </Text>

          <View className="flex-row flex-wrap gap-2 border-t border-border pt-4">
            <Button
              onPress={() =>
                router.replace({
                  pathname: '/chat/[conversationId]',
                  params: { conversationId, messageId },
                })
              }
            >
              <Text className="text-primary-foreground">대화에서 보기</Text>
            </Button>
            <Button
              onPress={() =>
                void copyText(
                  createAppUrl(
                    getCanonicalMessagePath(conversationId, messageId),
                  ),
                )
              }
              variant="outline"
            >
              <Icon as={Link2} className="mr-2 size-4 text-muted-foreground" />
              <Text>링크 복사</Text>
            </Button>
            {canEdit ? (
              <Button
                onPress={() =>
                  router.push({
                    pathname:
                      '/chat/[conversationId]/messages/[messageId]/edit',
                    params: { conversationId, messageId },
                  })
                }
                variant="outline"
              >
                <Icon
                  as={Pencil}
                  className="mr-2 size-4 text-muted-foreground"
                />
                <Text>수정</Text>
              </Button>
            ) : null}
          </View>
        </View>
      </View>
    </View>
  );
}

export function ChatMessageEditRoute(props: ChatMessageRouteProps) {
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
        <ChatErrorBoundary
          key={`${props.conversationId}:${props.messageId}:edit`}
        >
          <Suspense fallback={<ChatLoading label="메시지를 불러오는 중..." />}>
            <ChatMessageEditContent {...props} currentUserId={currentUserId} />
          </Suspense>
        </ChatErrorBoundary>
      )}
    </DashboardShell>
  );
}

function ChatMessageEditContent({
  conversationId,
  currentUserId,
  messageId,
}: ChatMessageRouteProps & { currentUserId: string }) {
  const router = useRouter();
  const message = useChatMessage(conversationId, messageId).data;
  const canEdit =
    message.senderKind === 'user' &&
    message.senderUserId === currentUserId &&
    message.contentType === 'text';

  return (
    <View className="min-h-0 flex-1 bg-background">
      <MessageRouteHeader
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
  const updateMessage = useChatControllerUpdateMessage({
    mutation: {
      onSuccess: (response) => {
        mergeUpdatedMessage(queryClient, response.data);
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
        {updateMessage.isError ? (
          <Text className="text-xs text-destructive">
            {getProblemDetail(updateMessage.error) ??
              '메시지를 수정하지 못했습니다.'}
          </Text>
        ) : null}
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

function MessageRouteHeader({
  description,
  onBack,
  title,
}: {
  description: string;
  onBack: () => void;
  title: string;
}) {
  return (
    <View className="shrink-0 flex-row items-center gap-3 border-b border-border px-4 py-3 sm:px-6">
      <Button
        accessibilityLabel="채팅으로 돌아가기"
        className="h-8 w-8"
        onPress={onBack}
        size="icon"
        variant="ghost"
      >
        <Icon as={ArrowLeft} className="size-4 text-muted-foreground" />
      </Button>
      <View className="min-w-0 flex-1">
        <Text className="text-sm font-semibold">{title}</Text>
        <Text className="truncate text-[11px] text-muted-foreground">
          {description}
        </Text>
      </View>
    </View>
  );
}
