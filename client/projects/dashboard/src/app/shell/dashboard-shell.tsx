import { type ReactNode, useEffect, useRef, useState } from 'react';
import {
  Animated,
  BackHandler,
  Platform,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@repo/client/rnr/components/ui/button';
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

import {
  Bot,
  Building2,
  CheckSquare,
  ChevronsUpDown,
  FileText,
  FolderKanban,
  LayoutDashboard,
  Menu,
  Moon,
  Search,
  Settings,
  Shapes,
  Sparkles,
  Sun,
  UserRound,
  Users,
  X,
} from 'lucide-react-native';
import { useColorScheme } from 'nativewind';

const DESKTOP_BREAKPOINT = 1024;
const MOBILE_DRAWER_WIDTH = 288;

const NAVIGATION_ITEMS = [
  { id: 'home', label: '홈', icon: LayoutDashboard, enabled: true },
  { id: 'members', label: '멤버', icon: Users, enabled: false },
  { id: 'teams', label: '팀', icon: Shapes, enabled: false },
  { id: 'projects', label: '프로젝트', icon: FolderKanban, enabled: false },
  { id: 'tasks', label: '업무', icon: CheckSquare, enabled: false },
  { id: 'docs', label: '문서', icon: FileText, enabled: false },
  { id: 'ai', label: 'AI', icon: Sparkles, enabled: false, badge: 'AGENT' },
  { id: 'settings', label: '설정', icon: Settings, enabled: false },
] as const;

type DashboardShellProps = {
  children: ReactNode;
};

export function DashboardShell({ children }: DashboardShellProps) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const drawerProgress = useRef(new Animated.Value(0)).current;
  const isDesktop = width >= DESKTOP_BREAKPOINT;
  const mobileDrawerOpen = !isDesktop && drawerOpen;

  useEffect(() => {
    Animated.timing(drawerProgress, {
      duration: 200,
      toValue: mobileDrawerOpen ? 1 : 0,
      useNativeDriver: true,
    }).start();
  }, [drawerProgress, mobileDrawerOpen]);

  useEffect(() => {
    if (Platform.OS === 'web' || !mobileDrawerOpen) {
      return;
    }

    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        setDrawerOpen(false);
        return true;
      },
    );

    return () => subscription.remove();
  }, [mobileDrawerOpen]);

  const drawerTranslateX = drawerProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [-MOBILE_DRAWER_WIDTH, 0],
  });

  return (
    <View className="flex-1 bg-background">
      <View className="flex-1 flex-row">
        {isDesktop ? (
          <View className="w-64 shrink-0 border-r border-border bg-sidebar px-3.5 py-4">
            <SidebarContent />
          </View>
        ) : null}

        <View className="min-w-0 flex-1 bg-background">
          {!isDesktop ? (
            <View
              className="z-30 flex-row items-center justify-between border-b border-border bg-background px-4 pb-3"
              style={{ paddingTop: insets.top + 12 }}
            >
              <View className="min-w-0 flex-1 flex-row items-center gap-2.5">
                <Button
                  accessibilityLabel="메뉴 열기"
                  className="h-8 w-8"
                  onPress={() => setDrawerOpen(true)}
                  size="icon"
                  variant="ghost"
                >
                  <Icon as={Menu} className="size-5 text-foreground" />
                </Button>
                <View className="min-w-0 flex-1 flex-row items-center gap-2">
                  <View className="size-6 items-center justify-center rounded bg-primary">
                    <Icon
                      as={Building2}
                      className="size-3.5 text-primary-foreground"
                    />
                  </View>
                  <Text className="max-w-[150px] truncate text-sm font-semibold tracking-tight">
                    조직 선택
                  </Text>
                </View>
              </View>

              <View className="flex-row items-center gap-1">
                <Button
                  accessibilityLabel="검색"
                  className="h-8 w-8"
                  size="icon"
                  variant="ghost"
                >
                  <Icon as={Search} className="size-4 text-muted-foreground" />
                </Button>
                <ThemeToggle />
                <View className="ml-1 size-7 items-center justify-center rounded-full bg-secondary">
                  <Icon
                    as={UserRound}
                    className="size-4 text-secondary-foreground"
                  />
                </View>
              </View>
            </View>
          ) : null}

          <View className="flex-1">{children}</View>
        </View>
      </View>

      {!isDesktop ? (
        <>
          <Animated.View
            pointerEvents={mobileDrawerOpen ? 'auto' : 'none'}
            style={[styles.mobileOverlay, { opacity: drawerProgress }]}
          >
            <Pressable
              accessibilityLabel="메뉴 닫기"
              className="flex-1 bg-zinc-950/60"
              onPress={() => setDrawerOpen(false)}
            />
          </Animated.View>

          <Animated.View
            pointerEvents={mobileDrawerOpen ? 'auto' : 'none'}
            style={[
              styles.mobileDrawer,
              {
                transform: [{ translateX: drawerTranslateX }],
              },
            ]}
          >
            <View
              className="flex-1 border-r border-border bg-sidebar px-4 pb-4"
              style={{
                paddingBottom: Math.max(insets.bottom, 16),
                paddingTop: insets.top + 16,
              }}
            >
              <View className="mb-3 flex-row items-center justify-between border-b border-border pb-3">
                <View className="flex-row items-center gap-2">
                  <View className="size-6 items-center justify-center rounded bg-primary">
                    <Text className="text-xs font-bold text-primary-foreground">
                      OS
                    </Text>
                  </View>
                  <Text className="text-sm font-semibold tracking-tight">
                    AI Work OS
                  </Text>
                </View>
                <Button
                  accessibilityLabel="메뉴 닫기"
                  className="h-8 w-8"
                  onPress={() => setDrawerOpen(false)}
                  size="icon"
                  variant="ghost"
                >
                  <Icon as={X} className="size-5 text-muted-foreground" />
                </Button>
              </View>

              <SidebarContent mobile onNavigate={() => setDrawerOpen(false)} />
            </View>
          </Animated.View>
        </>
      ) : null}
    </View>
  );
}

function SidebarContent({
  mobile = false,
  onNavigate,
}: {
  mobile?: boolean;
  onNavigate?: () => void;
}) {
  return (
    <View className="flex-1 justify-between">
      <View>
        <OrganizationSwitcher />

        {!mobile ? <QuickSearch /> : null}

        {!mobile ? (
          <Text className="mb-1.5 px-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Workspace
          </Text>
        ) : null}

        <View className={mobile ? 'gap-1' : 'gap-0.5'}>
          {NAVIGATION_ITEMS.map((item) => {
            const active = item.id === 'home';
            const aiItem = item.id === 'ai';

            return (
              <Pressable
                key={item.id}
                accessibilityRole="link"
                accessibilityState={{
                  disabled: !item.enabled,
                  selected: active,
                }}
                className={cn(
                  'flex-row items-center justify-between rounded-md',
                  mobile ? 'px-3 py-2' : 'px-2.5 py-1.5',
                  active
                    ? 'bg-accent'
                    : 'web:hover:bg-accent web:hover:[&_span]:text-accent-foreground',
                )}
                disabled={!item.enabled}
                onPress={item.enabled ? onNavigate : undefined}
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
          })}
        </View>
      </View>

      <View className={cn('border-t border-border pt-3', !mobile && 'gap-2')}>
        {!mobile ? <AiStatus /> : null}
        {mobile ? <ThemeToggle expanded /> : <AccountFooter />}
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
    <Pressable
      accessibilityLabel="검색 및 실행"
      className="mb-4 flex-row items-center justify-between rounded-md border border-border bg-muted/60 px-3 py-1.5 web:hover:bg-accent"
      disabled
    >
      <View className="flex-row items-center gap-2">
        <Icon as={Search} className="size-3.5 text-muted-foreground" />
        <Text className="text-xs text-muted-foreground">검색 및 실행...</Text>
      </View>
      <View className="rounded border border-input bg-secondary/80 px-1.5 py-0.5">
        <Text className="font-mono text-[10px] text-muted-foreground">⌘K</Text>
      </View>
    </Pressable>
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

function ThemeToggle({ expanded = false }: { expanded?: boolean }) {
  const { colorScheme, toggleColorScheme } = useColorScheme();
  const dark = colorScheme === 'dark';

  return (
    <Button
      accessibilityLabel="테마 모드 전환"
      className={cn(
        expanded ? 'h-auto w-full justify-start px-3 py-2' : 'h-8 w-8',
      )}
      onPress={toggleColorScheme}
      size={expanded ? 'sm' : 'icon'}
      variant="ghost"
    >
      <Icon as={dark ? Sun : Moon} className="size-4 text-muted-foreground" />
      {expanded ? (
        <Text className="text-xs text-muted-foreground">테마 모드 전환</Text>
      ) : null}
    </Button>
  );
}

const styles = StyleSheet.create({
  mobileDrawer: {
    bottom: 0,
    elevation: 24,
    left: 0,
    position: 'absolute',
    top: 0,
    width: MOBILE_DRAWER_WIDTH,
    zIndex: 50,
  },
  mobileOverlay: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 40,
  },
});
