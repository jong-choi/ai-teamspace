import { useEffect, useRef } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';

import { Button } from '@repo/client/rnr/components/ui/button';
import { Text } from '@repo/client/rnr/components/ui/text';
import { useDashboardPlatform } from '@core/app/platform/dashboard-platform';
import { DashboardShell } from '@core/app/shell/dashboard-shell';
import {
  DashboardLoading,
  DashboardQueryBoundary,
  DashboardState,
} from '@core/app/state/dashboard-query-state';
import { AgentChatWorkspace } from '@core/features/agent-chat/agent-chat-workspace';
import { useAgentActiveOrganization } from '@core/features/agent-chat/agent-thread-query';
import { AuthenticationRequiredState } from '@core/features/auth/authentication-required-state';

export function AgentChatRoute({
  invalidThreadId = false,
  threadId,
}: {
  invalidThreadId?: boolean;
  threadId?: string;
}) {
  const { currentUserId, sessionPending } = useDashboardPlatform();

  if (sessionPending) {
    return (
      <DashboardShell activeNavigationItem="ai">
        <DashboardLoading label="세션을 확인하는 중..." />
      </DashboardShell>
    );
  }

  if (!currentUserId) {
    return (
      <DashboardShell activeNavigationItem="ai">
        <AuthenticationRequiredState />
      </DashboardShell>
    );
  }

  return (
    <DashboardQueryBoundary
      fallback={
        <DashboardShell activeNavigationItem="ai">
          <DashboardLoading label="활성 조직을 불러오는 중..." />
        </DashboardShell>
      }
      resetKeys={[currentUserId]}
      title="활성 조직을 불러오지 못했습니다"
    >
      <AuthenticatedAgentChatRoute
        currentUserId={currentUserId}
        invalidThreadId={invalidThreadId}
        threadId={threadId}
      />
    </DashboardQueryBoundary>
  );
}

function AuthenticatedAgentChatRoute({
  currentUserId,
  invalidThreadId,
  threadId,
}: {
  currentUserId: string;
  invalidThreadId: boolean;
  threadId?: string;
}) {
  const router = useRouter();
  const activeOrganization = useAgentActiveOrganization().data;
  const organizationId = activeOrganization?.organization.id ?? null;
  const previousOrganizationId = useRef<string | null>(organizationId);

  useEffect(() => {
    const previous = previousOrganizationId.current;
    previousOrganizationId.current = organizationId;

    if (threadId && previous && organizationId && previous !== organizationId) {
      router.replace('/ai');
    }
  }, [organizationId, router, threadId]);

  return (
    <DashboardShell
      activeNavigationItem="ai"
      organizationName={activeOrganization?.organization.name}
    >
      {!activeOrganization ? (
        <DashboardState
          description="Agent는 활성 조직 범위에서 동작합니다. 조직을 선택한 뒤 다시 열어 주세요."
          title="활성 조직이 없습니다"
        />
      ) : invalidThreadId ? (
        <InvalidThreadState />
      ) : (
        <DashboardQueryBoundary
          fallback={
            <DashboardLoading label="Agent 대화 목록을 불러오는 중..." />
          }
          resetKeys={[activeOrganization.organization.id, currentUserId]}
          title="Agent 대화 목록을 불러오지 못했습니다"
        >
          <AgentChatWorkspace
            organizationId={activeOrganization.organization.id}
            threadId={threadId}
            userId={currentUserId}
          />
        </DashboardQueryBoundary>
      )}
    </DashboardShell>
  );
}

function InvalidThreadState() {
  const router = useRouter();

  return (
    <View className="flex-1 items-center justify-center gap-4 px-6">
      <DashboardState
        className="flex-none"
        description="올바르지 않은 Agent 대화 주소입니다. 새 대화 화면으로 돌아가 다시 선택해 주세요."
        title="Agent 대화 주소를 확인해 주세요"
      />
      <Button onPress={() => router.replace('/ai')} size="sm">
        <Text>새 Agent 대화로 이동</Text>
      </Button>
    </View>
  );
}
