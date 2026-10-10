import type { ReactNode } from 'react';
import { View } from 'react-native';

import { Text } from '@repo/client/rnr/components/ui/text';
import { cn } from '@repo/client/rnr/lib/utils';
import { AgentChatOpenButton } from '@core/features/agent-chat/components/agent-chat-open-button';

// 업무 route 공통 상단 바다. 왼쪽은 breadcrumb, 오른쪽은 보기 전환·주요 액션과 Agent 채팅 진입점을 둔다.
// 모든 화면에서 한 줄 높이가 같고, 폭이 부족할 때만 액션이 다음 줄로 내려간다.
export function DashboardPageHeader({
  actions,
  children,
  className,
  leading,
}: {
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  leading?: ReactNode;
}) {
  return (
    <View
      className={cn(
        'min-h-[60px] shrink-0 flex-row flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-border bg-background px-4 py-3 sm:min-h-14 lg:px-6',
        className,
      )}
    >
      <View className="min-w-28 flex-1 flex-row items-center gap-1.5">
        {leading}
        {children}
      </View>
      <View className="flex-row flex-wrap items-center gap-2">
        {actions}
        <AgentChatOpenButton />
      </View>
    </View>
  );
}

export function DashboardBreadcrumbItem({
  children,
  className,
  current = false,
}: {
  children: ReactNode;
  className?: string;
  current?: boolean;
}) {
  return (
    <Text
      className={cn(
        'text-xs',
        current ? 'font-semibold text-foreground' : 'text-muted-foreground',
        className,
      )}
    >
      {children}
    </Text>
  );
}

export function DashboardBreadcrumbSeparator({
  className,
}: {
  className?: string;
}) {
  return (
    <Text className={cn('text-xs text-muted-foreground', className)}>/</Text>
  );
}
