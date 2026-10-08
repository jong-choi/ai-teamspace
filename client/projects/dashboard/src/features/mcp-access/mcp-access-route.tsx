import { ScrollView, View } from 'react-native';

import { useDashboardPlatform } from '@core/app/platform/dashboard-platform';
import { DashboardShell } from '@core/app/shell/dashboard-shell';
import {
  DashboardLoading,
  DashboardQueryBoundary,
  DashboardState,
} from '@core/app/state/dashboard-query-state';
import { AuthenticationRequiredState } from '@core/features/auth/authentication-required-state';
import { McpAccessSummary } from '@core/features/mcp-access/components/policies/mcp-access-summary';
import { McpOrganizationPolicy } from '@core/features/mcp-access/components/policies/mcp-organization-policy';
import { McpPersonalPermissions } from '@core/features/mcp-access/components/policies/mcp-personal-permissions';
import {
  useMcpAccess,
  useMcpAccessActiveOrganization,
} from '@core/features/mcp-access/mcp-access-query';

export function McpAccessRoute() {
  const { currentUserId, sessionPending } = useDashboardPlatform();

  if (sessionPending) {
    return (
      <DashboardShell activeNavigationItem="settings">
        <DashboardLoading label="세션을 확인하는 중..." />
      </DashboardShell>
    );
  }

  if (!currentUserId) {
    return (
      <DashboardShell activeNavigationItem="settings">
        <AuthenticationRequiredState />
      </DashboardShell>
    );
  }

  return (
    <DashboardQueryBoundary
      fallback={
        <DashboardShell activeNavigationItem="settings">
          <DashboardLoading label="활성 조직을 불러오는 중..." />
        </DashboardShell>
      }
      resetKeys={[currentUserId]}
      title="MCP 설정을 열지 못했습니다"
    >
      <AuthenticatedMcpAccessRoute currentUserId={currentUserId} />
    </DashboardQueryBoundary>
  );
}

function AuthenticatedMcpAccessRoute({
  currentUserId,
}: {
  currentUserId: string;
}) {
  const activeOrganization = useMcpAccessActiveOrganization().data;

  return (
    <DashboardShell
      activeNavigationItem="settings"
      organizationName={activeOrganization?.organization.name}
    >
      {!activeOrganization ? (
        <DashboardState
          description="MCP 권한은 활성 조직별로 관리합니다. 조직을 선택한 뒤 다시 열어 주세요."
          title="활성 조직이 없습니다"
        />
      ) : (
        <DashboardQueryBoundary
          fallback={<DashboardLoading label="MCP 권한을 불러오는 중..." />}
          resetKeys={[currentUserId, activeOrganization.organization.id]}
          title="MCP 권한을 불러오지 못했습니다"
        >
          <McpAccessPage organizationId={activeOrganization.organization.id} />
        </DashboardQueryBoundary>
      )}
    </DashboardShell>
  );
}

function McpAccessPage({ organizationId }: { organizationId: string }) {
  return (
    <ScrollView className="min-h-0 flex-1" showsVerticalScrollIndicator={false}>
      <View className="mx-auto w-full max-w-5xl gap-5 p-4 sm:p-6 lg:p-8">
        <View className="gap-1">
          <DashboardState
            className="items-start p-0"
            description="Agent와 외부 MCP credential이 사용할 수 있는 capability의 조직 ceiling과 개인 요청 범위를 관리합니다."
            title="MCP 권한"
          />
        </View>
        <DashboardQueryBoundary
          fallback={
            <DashboardLoading
              className="min-h-28 flex-none"
              label="권한 요약"
            />
          }
          resetKeys={[organizationId]}
        >
          <McpPolicyContent organizationId={organizationId} section="summary" />
        </DashboardQueryBoundary>
        <DashboardQueryBoundary
          fallback={
            <DashboardLoading
              className="min-h-48 flex-none"
              label="내 MCP 권한"
            />
          }
          resetKeys={[organizationId]}
        >
          <McpPolicyContent
            organizationId={organizationId}
            section="personal"
          />
        </DashboardQueryBoundary>
        <DashboardQueryBoundary
          fallback={
            <DashboardLoading
              className="min-h-48 flex-none"
              label="조직 MCP 정책"
            />
          }
          resetKeys={[organizationId]}
        >
          <McpPolicyContent
            organizationId={organizationId}
            section="organization"
          />
        </DashboardQueryBoundary>
      </View>
    </ScrollView>
  );
}

function McpPolicyContent({
  organizationId,
  section,
}: {
  organizationId: string;
  section: 'summary' | 'personal' | 'organization';
}) {
  const access = useMcpAccess(organizationId).data;
  if (section === 'summary') return <McpAccessSummary access={access} />;
  if (section === 'personal') return <McpPersonalPermissions access={access} />;
  return <McpOrganizationPolicy access={access} />;
}
