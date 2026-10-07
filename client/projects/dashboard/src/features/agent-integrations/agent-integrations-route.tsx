import { ScrollView, View } from 'react-native';

import { useDashboardPlatform } from '@core/app/platform/dashboard-platform';
import { DashboardShell } from '@core/app/shell/dashboard-shell';
import {
  DashboardLoading,
  DashboardQueryBoundary,
  DashboardState,
} from '@core/app/state/dashboard-query-state';
import { AgentIntegrationsPage } from '@core/features/agent-integrations/components/agent-integrations-page';
import { useAgentIntegrationsActiveOrganization } from '@core/features/agent-integrations/agent-integrations-query';
import { AuthenticationRequiredState } from '@core/features/auth/authentication-required-state';

export function AgentIntegrationsRoute({
  openAuthorization,
}: {
  openAuthorization: (url: string) => Promise<void>;
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
      title="Agent 외부 연결을 열지 못했습니다"
    >
      <AuthenticatedAgentIntegrationsRoute
        currentUserId={currentUserId}
        openAuthorization={openAuthorization}
      />
    </DashboardQueryBoundary>
  );
}

function AuthenticatedAgentIntegrationsRoute({
  currentUserId,
  openAuthorization,
}: {
  currentUserId: string;
  openAuthorization: (url: string) => Promise<void>;
}) {
  const activeOrganization = useAgentIntegrationsActiveOrganization().data;

  return (
    <DashboardShell
      activeNavigationItem="ai"
      organizationName={activeOrganization?.organization.name}
    >
      {!activeOrganization ? (
        <DashboardState
          description="외부 MCP 연결은 활성 조직 범위에서 관리합니다. 조직을 선택한 뒤 다시 열어 주세요."
          title="활성 조직이 없습니다"
        />
      ) : (
        <DashboardQueryBoundary
          fallback={<DashboardLoading label="외부 MCP 연결을 불러오는 중..." />}
          resetKeys={[currentUserId, activeOrganization.organization.id]}
          title="외부 MCP 연결을 불러오지 못했습니다"
        >
          <ScrollView
            className="min-h-0 flex-1"
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View className="mx-auto w-full max-w-5xl p-4 sm:p-6 lg:p-8">
              <AgentIntegrationsPage openAuthorization={openAuthorization} />
            </View>
          </ScrollView>
        </DashboardQueryBoundary>
      )}
    </DashboardShell>
  );
}
