import { useCallback, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';

import { getChatControllerListConversationsQueryKey } from '@repo/client/api-client';
import { Button } from '@repo/client/rnr/components/ui/button';
import { Icon } from '@repo/client/rnr/components/ui/icon';
import { Text } from '@repo/client/rnr/components/ui/text';
import { cn } from '@repo/client/rnr/lib/utils';
import { useDashboardPlatform } from '@core/app/platform/dashboard-platform';
import { DashboardShell } from '@core/app/shell/dashboard-shell';
import { AuthenticationRequiredState } from '@core/features/auth/authentication-required-state';
import { ChatConversationPanel } from '@core/features/chat/chat-conversation-panel';
import { ChatConversationSidebar } from '@core/features/chat/chat-conversation-sidebar';
import { ChatCreateConversationDialog } from '@core/features/chat/chat-create-conversation-dialog';
import { useChatConversations } from '@core/features/chat/chat-query';
import { ChatLoading, ChatQueryBoundary } from '@core/features/chat/chat-state';

import { useQueryClient } from '@tanstack/react-query';
import { List, MessageSquare, Plus } from 'lucide-react-native';

type ChatRouteProps = {
  conversationId?: string;
  focusedMessageId?: string;
};

export function ChatRoute({
  conversationId,
  focusedMessageId,
}: ChatRouteProps) {
  const { currentUserId, sessionPending } = useDashboardPlatform();

  return (
    <DashboardShell>
      {sessionPending ? (
        <ChatLoading label="세션을 확인하는 중..." />
      ) : !currentUserId ? (
        <AuthenticationRequiredState />
      ) : (
        <AuthenticatedChatRoute
          conversationId={conversationId}
          currentUserId={currentUserId}
          focusedMessageId={focusedMessageId}
        />
      )}
    </DashboardShell>
  );
}

function AuthenticatedChatRoute({
  conversationId,
  currentUserId,
  focusedMessageId,
}: ChatRouteProps & { currentUserId: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  const selectConversation = useCallback(
    (id: string) => {
      setDrawerOpen(false);
      router.push({
        pathname: '/chat/[conversationId]',
        params: { conversationId: id },
      });
    },
    [router],
  );
  const openCreateDialog = useCallback(() => setCreateDialogOpen(true), []);
  const openDrawer = useCallback(() => setDrawerOpen(true), []);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  return (
    <View className="relative min-h-0 flex-1 flex-row overflow-hidden bg-background">
      <ChatQueryBoundary
        fallback={<ConversationSidebarFallback />}
        title="대화 목록을 불러오지 못했습니다"
      >
        <ChatConversationSidebar
          activeConversationId={conversationId}
          currentUserId={currentUserId}
          drawerOpen={drawerOpen}
          onCloseDrawer={closeDrawer}
          onOpenCreateDialog={openCreateDialog}
          onSelectConversation={selectConversation}
        />
      </ChatQueryBoundary>

      <Pressable
        accessibilityLabel="채널 목록 닫기"
        className={cn(
          'absolute inset-0 z-20 bg-black/50 md:hidden',
          drawerOpen ? 'flex' : 'hidden',
        )}
        onPress={closeDrawer}
      />

      <View className="min-h-0 min-w-0 flex-1 bg-background">
        {conversationId ? (
          <ChatConversationPanel
            key={conversationId}
            conversationId={conversationId}
            currentUserId={currentUserId}
            focusedMessageId={focusedMessageId}
            onOpenChannelDrawer={openDrawer}
          />
        ) : (
          <ChatQueryBoundary
            fallback={<ChatLoading label="채팅 목록을 불러오는 중..." />}
            title="채팅 목록을 불러오지 못했습니다"
          >
            <ChatConversationLanding
              onOpenChannelDrawer={openDrawer}
              onOpenCreateDialog={openCreateDialog}
            />
          </ChatQueryBoundary>
        )}
      </View>

      <ChatCreateConversationDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onCreated={(id) => {
          void queryClient.invalidateQueries({
            queryKey: getChatControllerListConversationsQueryKey(),
          });
          setCreateDialogOpen(false);
          selectConversation(id);
        }}
      />
    </View>
  );
}

function ChatConversationLanding({
  onOpenChannelDrawer,
  onOpenCreateDialog,
}: {
  onOpenChannelDrawer: () => void;
  onOpenCreateDialog: () => void;
}) {
  const conversations = useChatConversations().data;

  return (
    <EmptyConversationState
      hasConversations={conversations.length > 0}
      onOpenChannelDrawer={onOpenChannelDrawer}
      onOpenCreateDialog={onOpenCreateDialog}
    />
  );
}

function ConversationSidebarFallback() {
  return (
    <View className="absolute inset-y-0 left-0 z-30 hidden w-64 border-r border-border bg-background md:relative md:flex">
      <ChatLoading label="대화 목록을 불러오는 중..." />
    </View>
  );
}

function EmptyConversationState({
  hasConversations,
  onOpenChannelDrawer,
  onOpenCreateDialog,
}: {
  hasConversations: boolean;
  onOpenChannelDrawer: () => void;
  onOpenCreateDialog: () => void;
}) {
  return (
    <View className="flex-1 items-center justify-center px-6">
      <View className="mb-4 size-12 items-center justify-center rounded-xl bg-muted">
        <Icon as={MessageSquare} className="size-6 text-muted-foreground" />
      </View>
      <Text className="text-base font-semibold">
        {hasConversations ? '대화를 선택하세요' : '첫 대화를 만들어 보세요'}
      </Text>
      <View className="mt-4 flex-row gap-2">
        {hasConversations ? (
          <Button
            className="md:hidden"
            onPress={onOpenChannelDrawer}
            variant="outline"
          >
            <Icon as={List} className="mr-2 size-4 text-muted-foreground" />
            <Text>대화 목록</Text>
          </Button>
        ) : null}
        <Button onPress={onOpenCreateDialog}>
          <Icon as={Plus} className="mr-2 size-4 text-primary-foreground" />
          <Text className="text-primary-foreground">새 대화</Text>
        </Button>
      </View>
    </View>
  );
}
