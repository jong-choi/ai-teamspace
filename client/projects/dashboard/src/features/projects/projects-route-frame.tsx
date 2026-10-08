import type { ReactNode } from 'react';

import { useDashboardPlatform } from '@core/app/platform/dashboard-platform';
import { DashboardShell } from '@core/app/shell/dashboard-shell';
import {
  DashboardLoading,
  DashboardQueryBoundary,
  DashboardState,
} from '@core/app/state/dashboard-query-state';
import { AuthenticationRequiredState } from '@core/features/auth/authentication-required-state';
import { useProjectsActiveOrganization } from '@core/features/projects/projects-query';

export function ProjectsRouteFrame({
  children,
  resetKeys = [],
}: {
  children: (organizationId: string) => ReactNode;
  resetKeys?: unknown[];
}) {
  const { currentUserId, sessionPending } = useDashboardPlatform();

  if (sessionPending) {
    return (
      <DashboardShell activeNavigationItem="projects">
        <DashboardLoading label="세션을 확인하는 중..." />
      </DashboardShell>
    );
  }

  if (!currentUserId) {
    return (
      <DashboardShell activeNavigationItem="projects">
        <AuthenticationRequiredState />
      </DashboardShell>
    );
  }

  return (
    <DashboardQueryBoundary
      fallback={
        <DashboardShell activeNavigationItem="projects">
          <DashboardLoading label="활성 조직을 불러오는 중..." />
        </DashboardShell>
      }
      resetKeys={[currentUserId]}
      title="활성 조직을 불러오지 못했습니다"
    >
      <AuthenticatedProjectsFrame resetKeys={resetKeys}>
        {children}
      </AuthenticatedProjectsFrame>
    </DashboardQueryBoundary>
  );
}

function AuthenticatedProjectsFrame({
  children,
}: {
  children: (organizationId: string) => ReactNode;
  resetKeys: unknown[];
}) {
  const activeOrganization = useProjectsActiveOrganization().data;

  return (
    <DashboardShell
      activeNavigationItem="projects"
      organizationName={activeOrganization?.organization.name}
    >
      {!activeOrganization ? (
        <DashboardState
          description="프로젝트는 활성 조직 범위에서 동작합니다. 조직을 선택한 뒤 다시 열어 주세요."
          title="활성 조직이 없습니다"
        />
      ) : (
        children(activeOrganization.organization.id)
      )}
    </DashboardShell>
  );
}
