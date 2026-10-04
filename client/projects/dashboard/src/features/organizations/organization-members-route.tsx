import { ScrollView, View } from 'react-native';

import type { OrganizationAccess } from '@repo/client/api-client/schemas';
import { useDashboardPlatform } from '@core/app/platform/dashboard-platform';
import { DashboardShell } from '@core/app/shell/dashboard-shell';
import {
  DashboardLoading,
  DashboardQueryBoundary,
  DashboardState,
} from '@core/app/state/dashboard-query-state';
import { useOrganizationMemberFilters } from '@core/features/organizations/organization-member-filters';
import { OrganizationMemberList } from '@core/features/organizations/organization-member-list';
import { OrganizationMemberMetrics } from '@core/features/organizations/organization-member-metrics';
import { canManageOrganizationInvitations } from '@core/features/organizations/organization-member-permissions';
import { OrganizationMemberToolbar } from '@core/features/organizations/organization-member-toolbar';
import { OrganizationMembersHeader } from '@core/features/organizations/organization-members-header';
import { useOrganizationAccess } from '@core/features/organizations/organization-members-query';

export function OrganizationMembersRoute({
  organizationId,
}: {
  organizationId?: string;
}) {
  const { currentUserId, sessionPending } = useDashboardPlatform();

  if (sessionPending) {
    return (
      <DashboardShell activeNavigationItem="members">
        <DashboardLoading
          className="min-h-32 py-10"
          label="세션을 확인하는 중..."
        />
      </DashboardShell>
    );
  }

  if (!currentUserId) {
    return (
      <DashboardShell activeNavigationItem="members">
        <DashboardState
          className="py-10"
          description="조직 멤버 정보는 로그인 세션을 사용합니다. 먼저 로그인한 뒤 다시 열어 주세요."
          title="로그인이 필요합니다"
        />
      </DashboardShell>
    );
  }

  if (!organizationId) {
    return (
      <DashboardShell activeNavigationItem="members">
        <DashboardState
          className="py-10"
          description="조직을 선택한 뒤 멤버 관리 화면을 다시 열어 주세요."
          title="조직을 찾을 수 없습니다"
        />
      </DashboardShell>
    );
  }

  return (
    <DashboardQueryBoundary
      fallback={
        <DashboardShell activeNavigationItem="members">
          <DashboardLoading
            className="min-h-32 py-10"
            label="조직 정보를 불러오는 중..."
          />
        </DashboardShell>
      }
      resetKeys={[organizationId]}
      title="조직 정보를 불러오지 못했습니다"
    >
      <AuthenticatedOrganizationMembersRoute
        currentUserId={currentUserId}
        organizationId={organizationId}
      />
    </DashboardQueryBoundary>
  );
}

function AuthenticatedOrganizationMembersRoute({
  currentUserId,
  organizationId,
}: {
  currentUserId: string;
  organizationId: string;
}) {
  const access = useOrganizationAccess(organizationId).data;

  return (
    <DashboardShell
      activeNavigationItem="members"
      organizationName={access.organization.name}
    >
      <OrganizationMembersPage
        access={access}
        currentUserId={currentUserId}
        organizationId={organizationId}
      />
    </DashboardShell>
  );
}

function OrganizationMembersPage({
  access,
  currentUserId,
  organizationId,
}: {
  access: OrganizationAccess;
  currentUserId: string;
  organizationId: string;
}) {
  const filters = useOrganizationMemberFilters();
  const canManageInvitations = canManageOrganizationInvitations(access.role);
  const listLabel = canManageInvitations ? '멤버 및 초대 목록' : '멤버 목록';

  return (
    <ScrollView className="min-h-0 flex-1" showsVerticalScrollIndicator={false}>
      <View className="mx-auto w-full max-w-7xl gap-6 p-4 sm:p-6 lg:p-8">
        <OrganizationMembersHeader
          access={access}
          organizationId={organizationId}
        />

        <DashboardQueryBoundary
          fallback={
            <DashboardLoading
              className="min-h-32 py-10"
              label="멤버 및 초대 현황을 불러오는 중..."
            />
          }
          resetKeys={[organizationId]}
          title="멤버 및 초대 현황을 불러오지 못했습니다"
        >
          <OrganizationMemberMetrics
            actorRole={access.role}
            organizationId={organizationId}
          />
        </DashboardQueryBoundary>

        <View className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <OrganizationMemberToolbar filters={filters} />
          <DashboardQueryBoundary
            fallback={
              <DashboardLoading
                className="min-h-32 py-10"
                label={`${listLabel}을 불러오는 중...`}
              />
            }
            resetKeys={[
              organizationId,
              filters.params.offset,
              filters.params.role,
              filters.params.search,
            ]}
            title={`${listLabel}을 불러오지 못했습니다`}
          >
            <OrganizationMemberList
              actorRole={access.role}
              actorUserId={currentUserId}
              filters={filters}
              organizationId={organizationId}
              organizationName={access.organization.name}
            />
          </DashboardQueryBoundary>
        </View>
      </View>
    </ScrollView>
  );
}
