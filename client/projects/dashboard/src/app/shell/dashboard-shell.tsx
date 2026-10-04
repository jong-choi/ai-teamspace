import { type ReactNode, useEffect, useRef, useState } from 'react';
import {
  BackHandler,
  type LayoutChangeEvent,
  Platform,
  Pressable,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DashboardNavigationContent } from '@core/app/shell/dashboard-navigation-content';
import { ThemeToggle } from '@core/app/shell/theme-toggle';
import { Button } from '@repo/client/rnr/components/ui/button';
import { Icon } from '@repo/client/rnr/components/ui/icon';
import { Text } from '@repo/client/rnr/components/ui/text';
import { cn } from '@repo/client/rnr/lib/utils';

import { Building2, Menu, Search, UserRound, X } from 'lucide-react-native';

type DashboardShellProps = {
  children: ReactNode;
};

export function DashboardShell({ children }: DashboardShellProps) {
  const insets = useSafeAreaInsets();
  const [drawerOpen, setDrawerOpen] = useState(false);
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

  return (
    <View
      className="relative min-h-0 flex-1 flex-row overflow-hidden bg-background"
      onLayout={handleLayout}
    >
      <View
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

        <DashboardNavigationContent />
      </View>

      <View className="min-h-0 min-w-0 flex-1 bg-background">
        <View
          className="z-30 shrink-0 flex-row items-center justify-between border-b border-border bg-background px-4 pb-3 lg:hidden"
          style={{ paddingTop: insets.top + 12 }}
        >
          <View className="min-w-0 flex-1 flex-row items-center gap-2.5">
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
              <Text className="max-w-[150px] truncate text-sm font-semibold tracking-tight">
                조직 선택
              </Text>
            </View>
          </View>

          <View className="flex-row items-center gap-1">
            <Button
              accessibilityLabel="검색"
              className="h-8 w-8"
              disabled
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

        <View className="min-h-0 flex-1 overflow-hidden">{children}</View>
      </View>

      <Pressable
        accessibilityLabel="메뉴 닫기"
        className={cn(
          'absolute inset-0 z-40 bg-zinc-950/60 lg:hidden',
          drawerOpen ? 'flex' : 'hidden',
        )}
        onPress={() => setDrawerOpen(false)}
      />
    </View>
  );
}
