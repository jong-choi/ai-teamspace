import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';

import { Text } from '@repo/client/rnr/components/ui/text';
import {
  DashboardLoading,
  DashboardQueryBoundary,
} from '@core/app/state/dashboard-query-state';
import { ExternalMcpSection } from '@core/features/agent-integrations/components/agent-integrations-page';
import { McpOrganizationPolicy } from '@core/features/mcp-access/components/policies/mcp-organization-policy';
import { McpPersonalPermissions } from '@core/features/mcp-access/components/policies/mcp-personal-permissions';
import { useMcpAccess } from '@core/features/mcp-access/mcp-access-query';
import { SettingsRouteFrame } from '@core/features/settings/settings-route-frame';

// 에이전트가 나를 대신해 쓸 권한을 고르는 화면이다.
export function McpAccessRoute({
  openAuthorization,
}: {
  openAuthorization: (url: string) => Promise<void>;
}) {
  return (
    <SettingsRouteFrame activeTab="personal">
      {({ organizationId }) => (
        <McpPolicyPage organizationId={organizationId} section="personal">
          <ExternalMcpSection openAuthorization={openAuthorization} />
        </McpPolicyPage>
      )}
    </SettingsRouteFrame>
  );
}

// 조직 전체에서 허용할 권한의 상한을 정하는 화면이다.
export function McpOrganizationPolicyRoute() {
  return (
    <SettingsRouteFrame activeTab="organization">
      {({ organizationId }) => (
        <McpPolicyPage organizationId={organizationId} section="organization" />
      )}
    </SettingsRouteFrame>
  );
}

type McpPolicySection = 'organization' | 'personal';

function McpPolicyPage({
  children,
  organizationId,
  section,
}: {
  children?: ReactNode;
  organizationId: string;
  section: McpPolicySection;
}) {
  return (
    <ScrollView
      className="min-h-0 flex-1"
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <View className="mx-auto w-full max-w-7xl gap-6 p-4 sm:p-6 lg:p-8">
        <View className="gap-2">
          <Text className="text-xs font-semibold">Work OS 도구</Text>
          <DashboardQueryBoundary
            fallback={
              <DashboardLoading
                className="min-h-48 flex-none"
                label="권한을 불러오는 중..."
              />
            }
            resetKeys={[organizationId, section]}
            title="권한을 불러오지 못했습니다"
          >
            <McpPolicyContent
              organizationId={organizationId}
              section={section}
            />
          </DashboardQueryBoundary>
        </View>
        {children}
      </View>
    </ScrollView>
  );
}

function McpPolicyContent({
  organizationId,
  section,
}: {
  organizationId: string;
  section: McpPolicySection;
}) {
  const access = useMcpAccess(organizationId).data;
  return section === 'personal' ? (
    <McpPersonalPermissions access={access} />
  ) : (
    <McpOrganizationPolicy access={access} />
  );
}
