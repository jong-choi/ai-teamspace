import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { type Href, useRouter } from 'expo-router';

import { useOrganizationsControllerGetActiveSuspense } from '@repo/client/api-client';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@repo/client/rnr/components/ui/dropdown-menu';
import { Icon } from '@repo/client/rnr/components/ui/icon';
import { Text } from '@repo/client/rnr/components/ui/text';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@repo/client/rnr/components/ui/tooltip';
import { cn } from '@repo/client/rnr/lib/utils';
import { useDashboardPlatform } from '@core/app/platform/dashboard-platform';
import { DashboardAccountAvatar } from '@core/app/shell/dashboard-account-avatar';
import { ThemeToggle } from '@core/app/shell/theme-toggle';
import { DashboardQueryBoundary } from '@core/app/state/dashboard-query-state';
import { CreateOrganizationDialog } from '@core/features/organizations/create-organization-dialog';
import { OrganizationSwitcherItems } from '@core/features/organizations/organization-switcher-items';

import {
  Building2,
  CalendarDays,
  ChevronsUpDown,
  FileText,
  FolderKanban,
  MessageSquare,
  Network,
  Plus,
  Settings,
  Users,
} from 'lucide-react-native';

const CHAT_NAVIGATION_ITEM = {
  id: 'chat',
  label: '채팅',
  icon: MessageSquare,
} as const;

const NAVIGATION_ITEMS = [
  { id: 'members', label: '멤버', icon: Users },
  { id: 'projects', label: '프로젝트', icon: FolderKanban },
  { id: 'calendar', label: '회의일정', icon: CalendarDays },
  { id: 'wiki', label: '위키', icon: FileText },
  { id: 'knowledge-graph', label: '지식 그래프', icon: Network },
  CHAT_NAVIGATION_ITEM,
  { id: 'settings', label: '설정', icon: Settings },
] as const;

export type DashboardNavigationItemId = (typeof NAVIGATION_ITEMS)[number]['id'];

type DashboardNavigationContentProps = {
  activeItem?: DashboardNavigationItemId;
  collapsed?: boolean;
  organizationName?: string;
  onNavigate?: () => void;
};

export function DashboardNavigationContent({
  activeItem = 'projects',
  collapsed = false,
  organizationName,
  onNavigate,
}: DashboardNavigationContentProps) {
  return (
    <View className="min-h-0 flex-1">
      <ScrollView
        className="min-h-0 flex-1"
        contentContainerStyle={{ paddingBottom: 12 }}
        showsVerticalScrollIndicator={false}
      >
        <SidebarOrganizationSwitcher
          collapsed={collapsed}
          onNavigate={onNavigate}
          organizationName={organizationName}
        />

        <View className={cn('gap-1 lg:gap-0.5', collapsed && 'items-center')}>
          {NAVIGATION_ITEMS.filter((item) => item.id !== 'chat').map((item) => {
            const active = item.id === activeItem;
            if (item.id === 'members')
              return (
                <MembersNavigationItem
                  key={item.id}
                  item={item}
                  active={active}
                  collapsed={collapsed}
                  onNavigate={onNavigate}
                />
              );
            const route =
              item.id === 'projects'
                ? '/projects'
                : item.id === 'calendar'
                  ? '/calendar'
                  : item.id === 'wiki'
                    ? '/wiki'
                    : item.id === 'knowledge-graph'
                      ? '/knowledge-graph'
                      : '/settings/account';
            return (
              <NavigationItem
                key={item.id}
                item={item}
                active={active}
                collapsed={collapsed}
                route={route}
                onNavigate={onNavigate}
              />
            );
          })}
        </View>
      </ScrollView>

      <View
        className={cn(
          'shrink-0 gap-2 border-t border-border pt-3',
          collapsed && 'items-center',
        )}
      >
        <NavigationItem
          item={CHAT_NAVIGATION_ITEM}
          active={activeItem === 'chat'}
          collapsed={collapsed}
          route="/chat"
          onNavigate={onNavigate}
        />
        <AccountFooter collapsed={collapsed} />
      </View>
    </View>
  );
}

function OrganizationSwitcher({
  collapsed,
  onNavigate,
  organizationName,
}: {
  collapsed: boolean;
  onNavigate?: () => void;
  organizationName?: string;
}) {
  const { currentUserId } = useDashboardPlatform();
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <View className={cn('mb-4', collapsed && 'items-center')}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Pressable
            accessibilityLabel={`${organizationName ?? '조직'} 선택`}
            className={cn(
              'flex-row items-center rounded-lg border border-border bg-card web:hover:bg-accent',
              collapsed
                ? 'h-10 w-10 justify-center'
                : 'w-full justify-between p-2',
            )}
          >
            <View
              className={cn(
                'flex-row items-center',
                !collapsed && 'min-w-0 flex-1 gap-2.5',
              )}
            >
              <View className="size-7 shrink-0 items-center justify-center rounded bg-primary">
                <Icon
                  as={Building2}
                  className="size-4 text-primary-foreground"
                />
              </View>
              {collapsed ? null : (
                <View className="min-w-0 flex-1">
                  <Text className="truncate text-xs font-semibold">
                    {organizationName ?? '조직 선택'}
                  </Text>
                  <Text className="text-2xs text-muted-foreground">
                    {organizationName ? '현재 조직' : '활성 조직 없음'}
                  </Text>
                </View>
              )}
            </View>
            {collapsed ? null : (
              <Icon
                as={ChevronsUpDown}
                className="size-4 shrink-0 text-muted-foreground"
              />
            )}
          </Pressable>
        </DropdownMenuTrigger>
        {/* 접힌 사이드바에서는 아이콘 폭과 무관하게 메뉴 내용을 읽을 수 있는 폭을 유지한다. */}
        <DropdownMenuContent
          align="start"
          className={cn(
            'w-60 rounded-lg p-1.5 shadow-none',
            !collapsed && 'web:w-[var(--radix-dropdown-menu-trigger-width)]',
          )}
          side="bottom"
        >
          {currentUserId ? (
            <>
              <DashboardQueryBoundary
                fallback={
                  <DropdownMenuItem disabled>
                    <Text className="text-xs text-muted-foreground">
                      조직 목록을 불러오는 중...
                    </Text>
                  </DropdownMenuItem>
                }
                resetKeys={[currentUserId]}
                title="조직 목록을 불러오지 못했습니다"
              >
                <OrganizationSwitcherItems onSwitched={onNavigate} />
              </DashboardQueryBoundary>
              <DropdownMenuSeparator />
              {/* dialog는 메뉴 밖에서 렌더한다. 메뉴는 항목을 누르면 스스로 닫힌다. */}
              <DropdownMenuItem
                onPress={() => {
                  onNavigate?.();
                  setCreateOpen(true);
                }}
              >
                <Icon as={Plus} className="size-3.5 text-muted-foreground" />
                <Text className="text-xs">새 조직</Text>
              </DropdownMenuItem>
            </>
          ) : (
            <DropdownMenuItem disabled>
              <Text className="text-xs text-muted-foreground">
                로그인하면 조직을 선택할 수 있습니다.
              </Text>
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {createOpen ? (
        <CreateOrganizationDialog onOpenChange={setCreateOpen} />
      ) : null}
    </View>
  );
}

function AccountFooter({ collapsed }: { collapsed: boolean }) {
  const { currentUser, sessionPending, sessionError } = useDashboardPlatform();
  const title = sessionPending
    ? '계정 확인 중'
    : sessionError
      ? '계정 확인 실패'
      : (currentUser?.name ?? '로그인 필요');
  const description = sessionPending
    ? '로그인 상태를 확인하는 중...'
    : sessionError
      ? '로그인 정보를 다시 확인해 주세요.'
      : (currentUser?.email ?? '로그인해 주세요.');
  if (collapsed) {
    return (
      <View
        accessibilityLabel={title}
        className="items-center justify-center pt-1"
      >
        <DashboardAccountAvatar />
      </View>
    );
  }
  return (
    <View className="flex-row items-center justify-between pt-1">
      <View className="min-w-0 flex-1 flex-row items-center gap-2.5">
        <DashboardAccountAvatar />
        <View className="min-w-0 flex-1">
          <Text className="truncate text-xs font-semibold">{title}</Text>
          <Text className="truncate text-2xs text-muted-foreground">
            {description}
          </Text>
        </View>
      </View>
      <ThemeToggle />
    </View>
  );
}

function SidebarOrganizationSwitcher({
  collapsed,
  onNavigate,
  organizationName,
}: {
  collapsed: boolean;
  onNavigate?: () => void;
  organizationName?: string;
}) {
  const { currentUserId } = useDashboardPlatform();
  if (organizationName || !currentUserId)
    return (
      <OrganizationSwitcher
        collapsed={collapsed}
        onNavigate={onNavigate}
        organizationName={organizationName}
      />
    );
  return (
    <DashboardQueryBoundary
      fallback={
        <OrganizationSwitcher collapsed={collapsed} onNavigate={onNavigate} />
      }
      resetKeys={[currentUserId]}
      title="활성 조직을 불러오지 못했습니다"
    >
      <ResolvedOrganizationSwitcher
        collapsed={collapsed}
        onNavigate={onNavigate}
      />
    </DashboardQueryBoundary>
  );
}
function ResolvedOrganizationSwitcher({
  collapsed,
  onNavigate,
}: {
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const { data } = useOrganizationsControllerGetActiveSuspense();
  return (
    <OrganizationSwitcher
      collapsed={collapsed}
      onNavigate={onNavigate}
      organizationName={data.activeOrganization?.organization.name}
    />
  );
}

function NavigationItem({
  item,
  active,
  collapsed = false,
  route,
  onNavigate,
}: {
  item: (typeof NAVIGATION_ITEMS)[number];
  active: boolean;
  collapsed?: boolean;
  route?: Href;
  onNavigate?: () => void;
}) {
  const router = useRouter();
  const trigger = (
    <Pressable
      accessibilityLabel={item.label}
      accessibilityRole={route ? 'link' : undefined}
      accessibilityState={{ selected: active, disabled: !route }}
      disabled={!route}
      onPress={
        route
          ? () => {
              onNavigate?.();
              router.push(route);
            }
          : undefined
      }
      className={cn(
        'flex-row items-center rounded-md',
        collapsed
          ? 'h-10 w-10 justify-center'
          : 'justify-between px-3 py-2 lg:px-2.5 lg:py-1.5',
        active && 'bg-accent',
        route && !active && 'web:hover:bg-accent/60',
      )}
    >
      <View className={cn('flex-row items-center', !collapsed && 'gap-2.5')}>
        <Icon
          as={item.icon}
          className={cn(
            'size-4 shrink-0 text-muted-foreground',
            active && 'text-accent-foreground',
          )}
        />
        {collapsed ? null : (
          <Text
            className={cn(
              'text-xs',
              active
                ? 'font-medium text-accent-foreground'
                : 'text-muted-foreground',
            )}
          >
            {item.label}
          </Text>
        )}
      </View>
    </Pressable>
  );
  return collapsed ? (
    <Tooltip>
      <TooltipTrigger asChild>{trigger}</TooltipTrigger>
      <TooltipContent side="right">
        <Text>{item.label}</Text>
      </TooltipContent>
    </Tooltip>
  ) : (
    trigger
  );
}
function MembersNavigationItem(
  props: Pick<
    React.ComponentProps<typeof NavigationItem>,
    'item' | 'active' | 'collapsed' | 'onNavigate'
  >,
) {
  const { currentUserId } = useDashboardPlatform();
  if (!currentUserId) return <NavigationItem {...props} />;
  return (
    <DashboardQueryBoundary
      fallback={<NavigationItem {...props} />}
      resetKeys={[currentUserId]}
      title="멤버 관리 경로를 불러오지 못했습니다"
    >
      <ResolvedMembersNavigationItem {...props} />
    </DashboardQueryBoundary>
  );
}
function ResolvedMembersNavigationItem(
  props: React.ComponentProps<typeof MembersNavigationItem>,
) {
  const { data } = useOrganizationsControllerGetActiveSuspense();
  const organizationId = data.activeOrganization?.organization.id;
  return (
    <NavigationItem
      {...props}
      route={
        organizationId
          ? {
              pathname: '/organizations/[organizationId]/members',
              params: { organizationId },
            }
          : undefined
      }
    />
  );
}
