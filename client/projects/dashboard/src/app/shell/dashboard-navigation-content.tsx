import { Pressable, ScrollView, View } from 'react-native';
import { type Href, useRouter } from 'expo-router';

import { useOrganizationsControllerGetActiveSuspense } from '@repo/client/api-client';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@repo/client/rnr/components/ui/dropdown-menu';
import { Icon } from '@repo/client/rnr/components/ui/icon';
import { Text } from '@repo/client/rnr/components/ui/text';
import { cn } from '@repo/client/rnr/lib/utils';
import { useDashboardPlatform } from '@core/app/platform/dashboard-platform';
import { ThemeToggle } from '@core/app/shell/theme-toggle';
import { DashboardQueryBoundary } from '@core/app/state/dashboard-query-state';

import {
  Building2,
  CalendarDays,
  ChevronsUpDown,
  FileText,
  FolderKanban,
  MessageSquare,
  Network,
  Search,
  Settings,
  Sparkles,
  UserRound,
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
  { id: 'ai', label: 'AI', icon: Sparkles, badge: 'AGENT' },
  { id: 'settings', label: '설정', icon: Settings },
] as const;

export type DashboardNavigationItemId = (typeof NAVIGATION_ITEMS)[number]['id'];

type DashboardNavigationContentProps = {
  activeItem?: DashboardNavigationItemId;
  agentChatOpen?: boolean;
  agentChatPendingApproval?: boolean;
  organizationName?: string;
  onNavigate?: () => void;
  onToggleAgentChat?: () => void;
};

export function DashboardNavigationContent({
  activeItem = 'projects',
  agentChatOpen = false,
  agentChatPendingApproval = false,
  organizationName,
  onNavigate,
  onToggleAgentChat,
}: DashboardNavigationContentProps) {
  return (
    <View className="min-h-0 flex-1">
      <ScrollView
        className="min-h-0 flex-1"
        contentContainerStyle={{ paddingBottom: 12 }}
        showsVerticalScrollIndicator={false}
      >
        <SidebarOrganizationSwitcher organizationName={organizationName} />

        <View className="hidden lg:flex">
          <QuickSearch />
        </View>

        <View className="hidden lg:flex">
          <Text className="mb-1.5 px-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Workspace
          </Text>
        </View>

        <View className="gap-1 lg:gap-0.5">
          {NAVIGATION_ITEMS.filter((item) => item.id !== 'chat').map((item) => {
            const active = item.id === activeItem;
            if (item.id === 'members')
              return (
                <MembersNavigationItem
                  key={item.id}
                  item={item}
                  active={active}
                  onNavigate={onNavigate}
                />
              );
            if (item.id === 'ai')
              return (
                <AgentChatNavigationItem
                  key={item.id}
                  item={item}
                  open={agentChatOpen}
                  pendingApproval={agentChatPendingApproval}
                  onToggle={onToggleAgentChat}
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
                      : '/settings/mcp';
            return (
              <NavigationItem
                key={item.id}
                item={item}
                active={active}
                route={route}
                onNavigate={onNavigate}
              />
            );
          })}
        </View>
      </ScrollView>

      <View className="shrink-0 gap-2 border-t border-border pt-3">
        <View className="rounded-lg border border-border bg-card p-1">
          <NavigationItem
            item={CHAT_NAVIGATION_ITEM}
            active={activeItem === 'chat'}
            route="/chat"
            onNavigate={onNavigate}
          />
        </View>
        <AccountFooter />
      </View>
    </View>
  );
}

function OrganizationSwitcher({
  organizationName,
}: {
  organizationName?: string;
}) {
  return (
    <View className="mb-4">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Pressable className="w-full flex-row items-center justify-between rounded-lg border border-border bg-card p-2 shadow-sm web:hover:bg-accent">
            <View className="min-w-0 flex-1 flex-row items-center gap-2.5">
              <View className="size-7 shrink-0 items-center justify-center rounded bg-primary">
                <Icon
                  as={Building2}
                  className="size-4 text-primary-foreground"
                />
              </View>
              <View className="min-w-0 flex-1">
                <Text className="truncate text-xs font-semibold">
                  {organizationName ?? '조직 선택'}
                </Text>
                <Text className="text-[10px] text-muted-foreground">
                  {organizationName ? '현재 조직' : '활성 조직 없음'}
                </Text>
              </View>
            </View>
            <Icon
              as={ChevronsUpDown}
              className="size-4 shrink-0 text-muted-foreground"
            />
          </Pressable>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-60 p-1.5" side="bottom">
          <DropdownMenuLabel className="px-2 py-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            조직 선택
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem disabled>
            <Text className="text-xs text-muted-foreground">
              {organizationName ?? '연결된 조직 정보가 없습니다.'}
            </Text>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </View>
  );
}

function QuickSearch() {
  return (
    <View className="mb-4 flex-row items-center justify-between rounded-md border border-border bg-muted/60 px-3 py-1.5">
      <View className="flex-row items-center gap-2">
        <Icon as={Search} className="size-3.5 text-muted-foreground" />
        <Text className="text-xs text-muted-foreground">검색 및 실행...</Text>
      </View>
      <View className="rounded border border-input bg-secondary/80 px-1.5 py-0.5">
        <Text className="font-mono text-[10px] text-muted-foreground">⌘K</Text>
      </View>
    </View>
  );
}

function AccountFooter() {
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
  return (
    <View className="flex-row items-center justify-between pt-1">
      <View className="min-w-0 flex-1 flex-row items-center gap-2.5">
        <View className="size-7 shrink-0 items-center justify-center rounded-full border border-border bg-secondary">
          <Icon as={UserRound} className="size-4 text-secondary-foreground" />
        </View>
        <View className="min-w-0 flex-1">
          <Text className="truncate text-xs font-semibold">{title}</Text>
          <Text className="truncate text-[10px] text-muted-foreground">
            {description}
          </Text>
        </View>
      </View>
      <ThemeToggle />
    </View>
  );
}

function SidebarOrganizationSwitcher({
  organizationName,
}: {
  organizationName?: string;
}) {
  const { currentUserId } = useDashboardPlatform();
  if (organizationName || !currentUserId)
    return <OrganizationSwitcher organizationName={organizationName} />;
  return (
    <DashboardQueryBoundary
      fallback={<OrganizationSwitcher />}
      resetKeys={[currentUserId]}
      title="활성 조직을 불러오지 못했습니다"
    >
      <ResolvedOrganizationSwitcher />
    </DashboardQueryBoundary>
  );
}
function ResolvedOrganizationSwitcher() {
  const { data } = useOrganizationsControllerGetActiveSuspense();
  return (
    <OrganizationSwitcher
      organizationName={data.activeOrganization?.organization.name}
    />
  );
}

function NavigationItem({
  item,
  active,
  route,
  onNavigate,
}: {
  item: (typeof NAVIGATION_ITEMS)[number];
  active: boolean;
  route?: Href;
  onNavigate?: () => void;
}) {
  const router = useRouter();
  const aiItem = item.id === 'ai';
  return (
    <Pressable
      accessibilityRole={route ? 'link' : undefined}
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
        'flex-row items-center justify-between rounded-md px-3 py-2 lg:px-2.5 lg:py-1.5',
        active && 'bg-accent',
        route && !active && 'web:hover:bg-accent/60',
      )}
    >
      <View className="flex-row items-center gap-2.5">
        <Icon
          as={item.icon}
          className={cn(
            'size-4 shrink-0',
            aiItem
              ? 'text-violet-500 dark:text-violet-400'
              : 'text-muted-foreground',
            active && 'text-accent-foreground',
          )}
        />
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
      </View>

      {'badge' in item ? (
        <View className="rounded border border-violet-500/20 bg-violet-500/10 px-1.5 py-0.5">
          <Text className="text-[10px] font-semibold text-violet-600 dark:text-violet-400">
            {item.badge}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}
// AI는 페이지 이동이 아니라 우측(모바일은 전체) 채팅 패널을 여닫는 토글이다.
function AgentChatNavigationItem({
  item,
  open,
  pendingApproval,
  onToggle,
}: {
  item: (typeof NAVIGATION_ITEMS)[number];
  open: boolean;
  pendingApproval: boolean;
  onToggle?: () => void;
}) {
  return (
    <Pressable
      accessibilityLabel={pendingApproval ? 'AI, 승인 대기 중' : 'AI'}
      accessibilityRole="button"
      accessibilityState={{ expanded: open }}
      disabled={!onToggle}
      onPress={onToggle}
      className={cn(
        'flex-row items-center justify-between rounded-md px-3 py-2 lg:px-2.5 lg:py-1.5',
        open ? 'bg-accent' : 'web:hover:bg-accent/60',
      )}
    >
      <View className="flex-row items-center gap-2.5">
        <Icon
          as={item.icon}
          className={cn(
            'size-4 shrink-0 text-violet-500 dark:text-violet-400',
            open && 'text-accent-foreground',
          )}
        />
        <Text
          className={cn(
            'text-xs',
            open
              ? 'font-medium text-accent-foreground'
              : 'text-muted-foreground',
          )}
        >
          {item.label}
        </Text>
      </View>
      <View className="flex-row items-center gap-1.5">
        {pendingApproval ? (
          <View className="size-2 rounded-full bg-amber-500" />
        ) : null}
        {'badge' in item ? (
          <View className="rounded border border-violet-500/20 bg-violet-500/10 px-1.5 py-0.5">
            <Text className="text-[10px] font-semibold text-violet-600 dark:text-violet-400">
              {item.badge}
            </Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}
function MembersNavigationItem(
  props: Pick<
    React.ComponentProps<typeof NavigationItem>,
    'item' | 'active' | 'onNavigate'
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
