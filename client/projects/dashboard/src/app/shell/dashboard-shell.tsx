import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  BackHandler,
  type LayoutChangeEvent,
  Platform,
  Pressable,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePathname } from 'expo-router';

import { Button } from '@repo/client/rnr/components/ui/button';
import { Icon } from '@repo/client/rnr/components/ui/icon';
import { Text } from '@repo/client/rnr/components/ui/text';
import { cn } from '@repo/client/rnr/lib/utils';
import { DashboardAccountAvatar } from '@core/app/shell/dashboard-account-avatar';
import {
  DashboardNavigationContent,
  type DashboardNavigationItemId,
} from '@core/app/shell/dashboard-navigation-content';
import { DashboardOrganizationLabel } from '@core/app/shell/dashboard-organization-label';
import { ThemeToggle } from '@core/app/shell/theme-toggle';
import { AgentChatPanel } from '@core/features/agent-chat/agent-chat-panel';
import { useAgentChatStore } from '@core/features/agent-chat/agent-chat-provider';
import { useAgentChatWideLayout } from '@core/features/agent-chat/lib/use-agent-chat-layout';
import { useAgentChatOutsidePress } from '@core/features/agent-chat/lib/use-agent-chat-outside-press';

import { Building2, Menu, Sparkles, X } from 'lucide-react-native';

const DashboardShellContext = createContext(false);

type DashboardShellProps = {
  activeNavigationItem?: DashboardNavigationItemId;
  children: ReactNode;
  organizationName?: string;
};

export function DashboardShell({
  activeNavigationItem,
  children,
  organizationName,
}: DashboardShellProps) {
  const nested = useContext(DashboardShellContext);
  const pathname = usePathname();
  const currentItem =
    activeNavigationItem ??
    (pathname.startsWith('/projects')
      ? 'projects'
      : pathname.startsWith('/calendar')
        ? 'calendar'
        : pathname.startsWith('/wiki')
          ? 'wiki'
          : pathname.startsWith('/knowledge-graph')
            ? 'knowledge-graph'
            : pathname.startsWith('/chat')
              ? 'chat'
              : pathname.startsWith('/settings')
                ? 'settings'
                : pathname.startsWith('/organizations')
                  ? 'members'
                  : 'projects');
  const insets = useSafeAreaInsets();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const agentChatOpen = useAgentChatStore((state) => state.open);
  const agentChatExpanded = useAgentChatStore((state) => state.expanded);
  const agentChatPendingApproval = useAgentChatStore(
    (state) => state.pendingApproval,
  );
  const toggleAgentChat = useAgentChatStore((state) => state.togglePanel);
  const wide = useAgentChatWideLayout();
  const agentChatOutsidePress = useAgentChatOutsidePress();
  // 모바일에서 열렸거나 웹에서 확장되면 업무 본문은 숨기기만 하고 mount는 유지한다.
  const agentChatCoversBody = agentChatOpen && (!wide || agentChatExpanded);
  const previousLayoutWidth = useRef<number | null>(null);

  useEffect(() => {
    if (Platform.OS === 'web' || !drawerOpen) return;

    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        setDrawerOpen(false);
        return true;
      },
    );

    return () => subscription.remove();
  }, [drawerOpen]);

  const handleLayout = ({ nativeEvent }: LayoutChangeEvent) => {
    const width = nativeEvent.layout.width;
    const previousWidth = previousLayoutWidth.current;
    previousLayoutWidth.current = width;

    if (drawerOpen && previousWidth !== null && previousWidth !== width) {
      setDrawerOpen(false);
    }
  };

  if (nested) return children;

  return (
    <DashboardShellContext.Provider value={true}>
      <View
        className="relative min-h-0 flex-1 flex-row overflow-hidden bg-background"
        onLayout={handleLayout}
      >
        <View
          {...agentChatOutsidePress}
          className={cn(
            'absolute inset-y-0 left-0 z-50 min-h-0 w-72 overflow-hidden border-r border-border bg-sidebar px-4 pb-4',
            'web:transition-transform web:duration-200',
            'lg:relative lg:z-auto lg:w-64 lg:shrink-0 lg:translate-x-0 lg:px-3.5 lg:py-4',
            drawerOpen ? 'translate-x-0' : '-translate-x-full',
          )}
        >
          <View
            className="mb-3 shrink-0 flex-row items-center justify-between border-b border-border pb-3 lg:hidden"
            style={{ paddingTop: insets.top + 16 }}
          >
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

          <DashboardNavigationContent
            activeItem={currentItem}
            onNavigate={() => setDrawerOpen(false)}
            organizationName={organizationName}
          />
        </View>

        <View className="min-h-0 min-w-0 flex-1 bg-background">
          <View
            className="z-30 shrink-0 flex-row items-center justify-between border-b border-border bg-background px-4 pb-3 lg:hidden"
            style={{ paddingTop: insets.top + 12 }}
          >
            <View
              {...agentChatOutsidePress}
              className="min-w-0 flex-1 flex-row items-center gap-2.5"
            >
              <Button
                accessibilityLabel="메뉴 열기"
                accessibilityState={{ expanded: drawerOpen }}
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
                <DashboardOrganizationLabel />
              </View>
            </View>

            <View className="flex-row items-center gap-1">
              <AgentChatToggleButton
                onPress={toggleAgentChat}
                open={agentChatOpen}
                pendingApproval={agentChatPendingApproval}
              />
              <ThemeToggle />
              <View className="ml-1">
                <DashboardAccountAvatar />
              </View>
            </View>
          </View>

          <View className="min-h-0 flex-1 flex-row overflow-hidden">
            <View
              className={cn(
                'min-h-0 min-w-0 flex-1 overflow-hidden',
                agentChatCoversBody && 'hidden',
              )}
            >
              {children}
            </View>
            <AgentChatPanel />
          </View>
        </View>

        <Pressable
          accessibilityLabel="메뉴 닫기"
          className={cn(
            'absolute inset-0 z-40 bg-black/50 lg:hidden',
            drawerOpen ? 'flex' : 'hidden',
          )}
          onPress={() => setDrawerOpen(false)}
        />
      </View>
    </DashboardShellContext.Provider>
  );
}

function AgentChatToggleButton({
  onPress,
  open,
  pendingApproval,
}: {
  onPress: () => void;
  open: boolean;
  pendingApproval: boolean;
}) {
  return (
    <Button
      accessibilityLabel={
        pendingApproval
          ? 'Agent 채팅 열기, 승인 대기 중'
          : open
            ? 'Agent 채팅 닫기'
            : 'Agent 채팅 열기'
      }
      accessibilityState={{ expanded: open }}
      className={cn('relative h-8 w-8', open && 'bg-accent')}
      onPress={onPress}
      size="icon"
      variant="ghost"
    >
      <Icon
        as={Sparkles}
        className="size-4 text-violet-500 dark:text-violet-400"
      />
      {pendingApproval ? (
        <View
          accessibilityLabel="승인 대기"
          className="absolute right-1 top-1 size-2 rounded-full bg-amber-500"
        />
      ) : null}
    </Button>
  );
}
