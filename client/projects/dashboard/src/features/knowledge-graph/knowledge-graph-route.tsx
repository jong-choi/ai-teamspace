import type { ReactNode } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { useOrganizationsControllerGetActiveSuspense } from '@repo/client/api-client';
import type { OrganizationAccess } from '@repo/client/api-client/schemas';
import { useDashboardPlatform } from '@core/app/platform/dashboard-platform';
import { DashboardShell } from '@core/app/shell/dashboard-shell';
import {
  DashboardLoading,
  DashboardQueryBoundary,
  DashboardState,
} from '@core/app/state/dashboard-query-state';
import { AuthenticationRequiredState } from '@core/features/auth/authentication-required-state';
import { GraphStudio } from '@core/features/knowledge-graph/components/graph-studio';
import type { GraphStudioView } from '@core/features/knowledge-graph/components/graph-studio-header';
import {
  parseGraphDataCenterParams,
  parseGraphExploreParams,
  toGraphDataCenterSearchParams,
} from '@core/features/knowledge-graph/lib/graph-route-params';
import {
  GraphStudioProvider,
  useGraphStudioStore,
} from '@core/features/knowledge-graph/state/graph-studio-provider';

/**
 * 그래프 뷰와 데이터 센터가 공유하는 layout이다. 두 route를 오가도
 * shell·조직 확인·공용 store가 유지되어 선택과 고정 좌표가 남는다.
 */
export function KnowledgeGraphLayout({ children }: { children: ReactNode }) {
  const { currentUserId, sessionPending } = useDashboardPlatform();

  if (sessionPending) {
    return (
      <DashboardShell activeNavigationItem="knowledge-graph">
        <DashboardLoading label="세션을 확인하는 중..." />
      </DashboardShell>
    );
  }

  if (!currentUserId) {
    return (
      <DashboardShell activeNavigationItem="knowledge-graph">
        <AuthenticationRequiredState />
      </DashboardShell>
    );
  }

  return (
    <DashboardQueryBoundary
      fallback={
        <DashboardShell activeNavigationItem="knowledge-graph">
          <DashboardLoading label="활성 조직을 불러오는 중..." />
        </DashboardShell>
      }
      resetKeys={[currentUserId]}
      title="활성 조직을 불러오지 못했습니다"
    >
      <AuthenticatedKnowledgeGraphLayout currentUserId={currentUserId}>
        {children}
      </AuthenticatedKnowledgeGraphLayout>
    </DashboardQueryBoundary>
  );
}

function AuthenticatedKnowledgeGraphLayout({
  children,
  currentUserId,
}: {
  children: ReactNode;
  currentUserId: string;
}) {
  const activeOrganization =
    useOrganizationsControllerGetActiveSuspense<OrganizationAccess | null>({
      query: { select: (response) => response.activeOrganization },
    }).data;
  const organizationId = activeOrganization?.organization.id;

  return (
    <DashboardShell
      activeNavigationItem="knowledge-graph"
      organizationName={activeOrganization?.organization.name}
    >
      {!organizationId ? (
        <DashboardState
          description="지식 그래프는 활성 조직 범위에서 동작합니다. 조직을 선택한 뒤 다시 열어 주세요."
          title="활성 조직이 없습니다"
        />
      ) : (
        // 사용자·조직이 바뀌면 선택·편집 대상·고정 좌표를 새로 시작한다.
        <GraphStudioProvider
          key={`${currentUserId}:${organizationId}`}
          organizationId={organizationId}
        >
          {children}
        </GraphStudioProvider>
      )}
    </DashboardShell>
  );
}

export function KnowledgeGraphRoute({ view }: { view: GraphStudioView }) {
  const router = useRouter();
  const searchParams = useLocalSearchParams();
  const organizationId = useGraphStudioStore((state) => state.organizationId);

  return (
    <GraphStudio
      dataParams={parseGraphDataCenterParams(searchParams)}
      exploreParams={parseGraphExploreParams(searchParams)}
      onExploreSearch={(q) =>
        router.setParams({
          q: q || undefined,
          focusKind: undefined,
          focusId: undefined,
        })
      }
      onDataParamsChange={(params) =>
        router.setParams(toGraphDataCenterSearchParams(params))
      }
      onViewChange={(nextView) => {
        if (nextView === view) return;
        // 보기 전환은 history에 남겨 뒤로가기로 이전 보기에 돌아올 수 있게 한다.
        router.push(
          nextView === 'data' ? '/knowledge-graph/data' : '/knowledge-graph',
        );
      }}
      organizationId={organizationId}
      view={view}
    />
  );
}
