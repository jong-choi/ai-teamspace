import { Pressable, ScrollView, View } from 'react-native';

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
import { ThemeToggle } from '@core/app/shell/theme-toggle';

import {
  Bot,
  Building2,
  CheckSquare,
  ChevronsUpDown,
  FileText,
  FolderKanban,
  LayoutDashboard,
  Search,
  Settings,
  Shapes,
  Sparkles,
  UserRound,
  Users,
} from 'lucide-react-native';

const NAVIGATION_ITEMS = [
  { id: 'home', label: '홈', icon: LayoutDashboard },
  { id: 'members', label: '멤버', icon: Users },
  { id: 'teams', label: '팀', icon: Shapes },
  { id: 'projects', label: '프로젝트', icon: FolderKanban },
  { id: 'tasks', label: '업무', icon: CheckSquare },
  { id: 'docs', label: '문서', icon: FileText },
  { id: 'ai', label: 'AI', icon: Sparkles, badge: 'AGENT' },
  { id: 'settings', label: '설정', icon: Settings },
] as const;

export function DashboardNavigationContent() {
  return (
    <View className="min-h-0 flex-1">
      <ScrollView
        className="min-h-0 flex-1"
        contentContainerStyle={{ paddingBottom: 12 }}
        showsVerticalScrollIndicator={false}
      >
        <OrganizationSwitcher />

        <View className="hidden lg:flex">
          <QuickSearch />
        </View>

        <View className="hidden lg:flex">
          <Text className="mb-1.5 px-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Workspace
          </Text>
        </View>

        <View className="gap-1 lg:gap-0.5">
          {NAVIGATION_ITEMS.map((item) => {
            const active = item.id === 'home';
            const aiItem = item.id === 'ai';

            return (
              <View
                key={item.id}
                className={cn(
                  'flex-row items-center justify-between rounded-md px-3 py-2 lg:px-2.5 lg:py-1.5',
                  active && 'bg-accent',
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
              </View>
            );
          })}
        </View>
      </ScrollView>

      <View className="hidden shrink-0 gap-2 border-t border-border pt-3 lg:flex">
        <AiStatus />
        <AccountFooter />
      </View>
    </View>
  );
}

function OrganizationSwitcher() {
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
                  조직 선택
                </Text>
                <Text className="text-[10px] text-muted-foreground">
                  활성 조직 없음
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
              연결된 조직 정보가 없습니다.
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

function AiStatus() {
  return (
    <View className="rounded-lg border border-border bg-card p-2">
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center gap-1.5">
          <View className="size-1.5 rounded-full bg-muted-foreground" />
          <Text className="text-[11px] font-medium">AI 엔진</Text>
        </View>
        <Icon as={Bot} className="size-3.5 text-muted-foreground" />
      </View>
      <Text className="mt-1 text-[10px] text-muted-foreground">
        상태 정보 연결 전
      </Text>
    </View>
  );
}

function AccountFooter() {
  return (
    <View className="flex-row items-center justify-between pt-1">
      <View className="min-w-0 flex-1 flex-row items-center gap-2.5">
        <View className="size-7 shrink-0 items-center justify-center rounded-full border border-border bg-secondary">
          <Icon as={UserRound} className="size-4 text-secondary-foreground" />
        </View>
        <View className="min-w-0 flex-1">
          <Text className="truncate text-xs font-semibold">계정</Text>
          <Text className="truncate text-[10px] text-muted-foreground">
            사용자 정보 연결 전
          </Text>
        </View>
      </View>
      <ThemeToggle />
    </View>
  );
}
