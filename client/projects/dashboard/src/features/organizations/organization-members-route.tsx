import { ScrollView, View } from 'react-native';

import type { OrganizationAccess } from '@repo/client/api-client/schemas';
import { useDashboardPlatform } from '@core/app/platform/dashboard-platform';
import { DashboardRoutePlaceholder } from '@core/app/shell/dashboard-route-placeholder';
import { DashboardShell } from '@core/app/shell/dashboard-shell';
import {
  DashboardLoading,
  DashboardQueryBoundary,
  DashboardState,
} from '@core/app/state/dashboard-query-state';
import { AuthenticationRequiredState } from '@core/features/auth/authentication-required-state';
import { useOrganizationMemberFilters } from '@core/features/organizations/organization-member-filters';
import { OrganizationMemberList } from '@core/features/organizations/organization-member-list';
import { canManageOrganizationInvitations } from '@core/features/organizations/organization-member-permissions';
import { OrganizationMemberToolbar } from '@core/features/organizations/organization-member-toolbar';
import { OrganizationMembersHeader } from '@core/features/organizations/organization-members-header';
import { useOrganizationAccess } from '@core/features/organizations/organization-members-query';

export function OrganizationMembersRoute({
  initialSearch,
  organizationId,
}: {
  initialSearch?: string;
  organizationId?: string;
}) {
  const { currentUserId, sessionPending } = useDashboardPlatform();

  if (sessionPending) {
    return (
      <DashboardShell activeNavigationItem="members">
        <DashboardRoutePlaceholder title="조직 멤버 관리">
          <DashboardLoading
            className="min-h-32 py-10"
            label="세션을 확인하는 중..."
          />
        </DashboardRoutePlaceholder>
      </DashboardShell>
    );
  }

  if (!currentUserId) {
    return (
      <DashboardShell activeNavigationItem="members">
        <DashboardRoutePlaceholder title="조직 멤버 관리">
          <AuthenticationRequiredState className="py-10" />
        </DashboardRoutePlaceholder>
      </DashboardShell>
    );
  }

  if (!organizationId) {
    return (
      <DashboardShell activeNavigationItem="members">
        <DashboardRoutePlaceholder title="조직 멤버 관리">
          <DashboardState
            className="py-10"
            description="조직을 선택한 뒤 멤버 관리 화면을 다시 열어 주세요."
            title="조직을 찾을 수 없습니다"
          />
        </DashboardRoutePlaceholder>
      </DashboardShell>
    );
  }

  return (
    <DashboardQueryBoundary
      fallback={
        <DashboardShell activeNavigationItem="members">
          <DashboardRoutePlaceholder title="조직 멤버 관리">
            <DashboardLoading
              className="min-h-32 py-10"
              label="조직 정보를 불러오는 중..."
            />
          </DashboardRoutePlaceholder>
        </DashboardShell>
      }
      resetKeys={[organizationId]}
      title="조직 정보를 불러오지 못했습니다"
    >
      <AuthenticatedOrganizationMembersRoute
        currentUserId={currentUserId}
        initialSearch={initialSearch}
        organizationId={organizationId}
      />
    </DashboardQueryBoundary>
  );
}

function AuthenticatedOrganizationMembersRoute({
  currentUserId,
  initialSearch,
  organizationId,
}: {
  currentUserId: string;
  initialSearch?: string;
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
        initialSearch={initialSearch}
        organizationId={organizationId}
      />
    </DashboardShell>
  );
}

function OrganizationMembersPage({
  access,
  currentUserId,
  initialSearch,
  organizationId,
}: {
  access: OrganizationAccess;
  currentUserId: string;
  initialSearch?: string;
  organizationId: string;
}) {
  const filters = useOrganizationMemberFilters(initialSearch);
  const canManageInvitations = canManageOrganizationInvitations(access.role);
  const listLabel = canManageInvitations ? '멤버 및 초대 목록' : '멤버 목록';

  return (
    <View className="min-h-0 flex-1 bg-background">
      <OrganizationMembersHeader
        access={access}
        organizationId={organizationId}
      />
      <ScrollView
        className="min-h-0 flex-1"
        showsVerticalScrollIndicator={false}
      >
        <View className="mx-auto w-full max-w-7xl gap-6 p-4 sm:p-6 lg:p-8">
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
    </View>
  );
}
