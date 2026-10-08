import { View } from 'react-native';
import { useRouter } from 'expo-router';

import {
  DashboardLoading,
  DashboardQueryBoundary,
} from '@core/app/state/dashboard-query-state';
import { AgentChatHome } from '@core/features/agent-chat/agent-chat-home';
import { useAgentChatNavigation } from '@core/features/agent-chat/agent-chat-navigation-provider';
import { AgentChatStream } from '@core/features/agent-chat/agent-chat-stream';
import {
  getAgentThreadQueryKey,
  getAgentThreadsQueryKey,
  useAgentThread,
  useAgentThreads,
} from '@core/features/agent-chat/agent-thread-query';
import { AgentThreadSidebar } from '@core/features/agent-chat/components/agent-thread-sidebar';

import { useQueryClient } from '@tanstack/react-query';

export function AgentChatWorkspace({
  organizationId,
  threadId,
  userId,
}: {
  organizationId: string;
  threadId?: string;
  userId: string;
}) {
  const router = useRouter();

  const openThread = (nextThreadId: string) => {
    router.push({
      pathname: '/ai/[threadId]',
      params: { threadId: nextThreadId },
    });
  };

  return (
    <View className="min-h-0 flex-1 flex-col overflow-hidden md:flex-row">
      <DashboardQueryBoundary
        fallback={
          <View className="min-h-20 md:w-64">
            <DashboardLoading label="대화 목록" />
          </View>
        }
        resetKeys={[organizationId, userId]}
        title="대화 목록을 불러오지 못했습니다"
      >
        <AgentThreadList
          activeThreadId={threadId}
          onCreateNew={() => router.push('/ai')}
          onSelectThread={openThread}
          userId={userId}
          organizationId={organizationId}
        />
      </DashboardQueryBoundary>
      <View className="min-h-0 min-w-0 flex-1">
        {threadId ? (
          <DashboardQueryBoundary
            fallback={<DashboardLoading label="Agent 대화를 불러오는 중..." />}
            homeHref="/ai"
            resetKeys={[organizationId, threadId, userId]}
            title="Agent 대화를 열 수 없습니다"
          >
            <AgentThreadConversation
              key={`${userId}:${organizationId}:${threadId}`}
              organizationId={organizationId}
              threadId={threadId}
              userId={userId}
            />
          </DashboardQueryBoundary>
        ) : (
          <AgentChatHome organizationId={organizationId} userId={userId} />
        )}
      </View>
    </View>
  );
}

function AgentThreadConversation({
  organizationId,
  threadId,
  userId,
}: {
  organizationId: string;
  threadId: string;
  userId: string;
}) {
  useAgentThread(userId, organizationId, threadId);
  const queryClient = useQueryClient();
  const { clearStarter, peekStarter } = useAgentChatNavigation();
  const starterMessage = peekStarter(threadId);

  const invalidateThreadQueries = () => {
    void queryClient.invalidateQueries({
      queryKey: getAgentThreadsQueryKey(userId, organizationId),
    });
    void queryClient.invalidateQueries({
      queryKey: getAgentThreadQueryKey(userId, organizationId, threadId),
    });
  };

  return (
    <AgentChatStream
      onRunFinished={invalidateThreadQueries}
      onStarterStarted={() => clearStarter(threadId)}
      organizationId={organizationId}
      starterMessage={starterMessage}
      threadId={threadId}
      userId={userId}
    />
  );
}

function AgentThreadList({
  userId,
  organizationId,
  ...props
}: Omit<React.ComponentProps<typeof AgentThreadSidebar>, 'threads'> & {
  userId: string;
  organizationId: string;
}) {
  const threads = useAgentThreads(userId, organizationId).data;
  return <AgentThreadSidebar {...props} threads={threads} />;
}
