import { View } from 'react-native';
import { useRouter } from 'expo-router';

import { Button } from '@repo/client/rnr/components/ui/button';
import { Icon } from '@repo/client/rnr/components/ui/icon';
import { Text } from '@repo/client/rnr/components/ui/text';
import { useDashboardPlatform } from '@core/app/platform/dashboard-platform';
import { DashboardShell } from '@core/app/shell/dashboard-shell';
import { AuthenticationRequiredState } from '@core/features/auth/authentication-required-state';
import { ChatMessageRouteHeader } from '@core/features/chat/chat-message-route-header';
import {
  formatMessageDateTime,
  getCanonicalMessagePath,
} from '@core/features/chat/chat-presenter';
import {
  useChatConversationParticipants,
  useChatMessage,
} from '@core/features/chat/chat-query';
import {
  ChatLoading,
  ChatQueryBoundary,
  ChatState,
} from '@core/features/chat/chat-state';
import { OrganizationInvitationMessage } from '@core/features/invitations/organization-invitation-message';

import { Link2, MessageSquareText, Pencil } from 'lucide-react-native';

type ChatMessageDetailRouteProps = {
  conversationId: string;
  messageId: string;
};

export function ChatMessageDetailRoute(props: ChatMessageDetailRouteProps) {
  const { currentUserId, sessionPending } = useDashboardPlatform();

  return (
    <DashboardShell>
      {sessionPending ? (
        <ChatLoading label="세션을 확인하는 중..." />
      ) : !currentUserId ? (
        <AuthenticationRequiredState />
      ) : (
        <ChatQueryBoundary
          fallback={<ChatLoading label="메시지를 불러오는 중..." />}
          resetKeys={[props.conversationId, props.messageId]}
          title="메시지를 불러오지 못했습니다"
        >
          <ChatMessageDetailContent {...props} currentUserId={currentUserId} />
        </ChatQueryBoundary>
      )}
    </DashboardShell>
  );
}

function ChatMessageDetailContent({
  conversationId,
  currentUserId,
  messageId,
}: ChatMessageDetailRouteProps & { currentUserId: string }) {
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
    message.content.type === 'text';

  return (
    <View className="min-h-0 flex-1 bg-background">
      <ChatMessageRouteHeader
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

          {message.content.type === 'text' ? (
            <Text className="text-sm leading-6 text-foreground/90">
              {message.content.text}
            </Text>
          ) : message.content.type === 'organization_invitation' ? (
            <OrganizationInvitationMessage
              content={message.content}
              onOpenInvitation={(invitationId) =>
                router.push({
                  pathname: '/invitations/[invitationId]',
                  params: { invitationId },
                })
              }
            />
          ) : null}

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
