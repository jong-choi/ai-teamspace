import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { type Href, useRouter } from 'expo-router';

import { useOrganizationsControllerGetActiveSuspense } from '@repo/client/api-client';
import { Text } from '@repo/client/rnr/components/ui/text';
import { cn } from '@repo/client/rnr/lib/utils';
import { useDashboardPlatform } from '@core/app/platform/dashboard-platform';
import {
  DashboardBreadcrumbItem,
  DashboardBreadcrumbSeparator,
  DashboardPageHeader,
} from '@core/app/shell/dashboard-page-header';
import { DashboardShell } from '@core/app/shell/dashboard-shell';
import {
  DashboardLoading,
  DashboardQueryBoundary,
  DashboardState,
} from '@core/app/state/dashboard-query-state';
import { AuthenticationRequiredState } from '@core/features/auth/authentication-required-state';

const SETTINGS_TABS = [
  { id: 'account', label: '내 계정', href: '/settings/account' },
  { id: 'theme', label: '테마', href: '/settings/theme' },
  { id: 'personal', label: 'AI 권한', href: '/settings/mcp' },
  {
    id: 'organization',
    label: '조직 AI 정책',
    href: '/settings/mcp/organization',
  },
  { id: 'connect', label: 'MCP 연결', href: '/settings/connect' },
] as const satisfies readonly { id: string; label: string; href: Href }[];

export type SettingsTabId = (typeof SETTINGS_TABS)[number]['id'];

// 설정 화면 공통 틀이다. 상단 바와 탭은 항상 보이고, 본문만 세션·활성 조직 상태에 따라 바뀐다.
export function SettingsRouteFrame({
  actions,
  activeTab,
  children,
  userContent,
}: {
  actions?: ReactNode;
  activeTab: SettingsTabId;
  // 활성 조직 범위에서 동작하는 탭의 본문이다. 조직과 무관한 탭은 userContent를 쓴다.
  children?: (context: {
    currentUserId: string;
    organizationId: string;
  }) => ReactNode;
  userContent?: (context: { currentUserId: string }) => ReactNode;
}) {
  const { currentUserId, sessionPending } = useDashboardPlatform();
  const activeLabel = SETTINGS_TABS.find((tab) => tab.id === activeTab)?.label;

  return (
    <DashboardShell activeNavigationItem="settings">
      <View className="min-h-0 flex-1 bg-background">
        <DashboardPageHeader actions={actions}>
          <DashboardBreadcrumbItem>설정</DashboardBreadcrumbItem>
          <DashboardBreadcrumbSeparator />
          <DashboardBreadcrumbItem current>
            {activeLabel}
          </DashboardBreadcrumbItem>
        </DashboardPageHeader>
        <SettingsTabs activeTab={activeTab} />

        {sessionPending ? (
          <DashboardLoading label="세션을 확인하는 중..." />
        ) : !currentUserId ? (
          <AuthenticationRequiredState />
        ) : userContent ? (
          userContent({ currentUserId })
        ) : (
          <DashboardQueryBoundary
            fallback={<DashboardLoading label="활성 조직을 불러오는 중..." />}
            resetKeys={[currentUserId]}
            title="설정을 열지 못했습니다"
          >
            <SettingsOrganizationScope currentUserId={currentUserId}>
              {children}
            </SettingsOrganizationScope>
          </DashboardQueryBoundary>
        )}
      </View>
    </DashboardShell>
  );
}

function SettingsOrganizationScope({
  children,
  currentUserId,
}: {
  children?: (context: {
    currentUserId: string;
    organizationId: string;
  }) => ReactNode;
  currentUserId: string;
}) {
  const organizationId =
    useOrganizationsControllerGetActiveSuspense().data.activeOrganization
      ?.organization.id;

  if (!organizationId) {
    return (
      <DashboardState
        description="조직을 선택한 뒤 다시 열어 주세요."
        title="활성 조직이 없습니다"
      />
    );
  }
  return children?.({ currentUserId, organizationId }) ?? null;
}

function SettingsTabs({ activeTab }: { activeTab: SettingsTabId }) {
  const router = useRouter();
  return (
    <View
      accessibilityRole="tablist"
      className="shrink-0 flex-row gap-1 border-b border-border px-4 lg:px-6"
    >
      {SETTINGS_TABS.map((tab) => {
        const active = tab.id === activeTab;
        return (
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            className={cn(
              '-mb-px border-b-2 px-2.5 py-2.5',
              active
                ? 'border-foreground'
                : 'border-transparent web:hover:border-border',
            )}
            key={tab.id}
            onPress={() => {
              if (!active) router.push(tab.href);
            }}
          >
            <Text
              className={cn(
                'text-xs',
                active
                  ? 'font-semibold text-foreground'
                  : 'text-muted-foreground',
              )}
            >
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
