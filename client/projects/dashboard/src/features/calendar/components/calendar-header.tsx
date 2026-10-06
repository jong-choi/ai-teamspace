import { Pressable, View } from 'react-native';

import { Button } from '@repo/client/rnr/components/ui/button';
import { Icon } from '@repo/client/rnr/components/ui/icon';
import { Text } from '@repo/client/rnr/components/ui/text';
import { cn } from '@repo/client/rnr/lib/utils';
import type { CalendarViewMode } from '@core/features/calendar/lib/calendar-range';

import {
  Building2,
  CalendarDays,
  CalendarRange,
  Clock3,
  List,
  PanelLeftOpen,
  Plus,
} from 'lucide-react-native';

const viewItems: readonly {
  id: CalendarViewMode;
  label: string;
  icon: typeof CalendarDays;
}[] = [
  { id: 'month', label: '월간', icon: CalendarDays },
  { id: 'week', label: '주간', icon: CalendarRange },
  { id: 'day', label: '일간', icon: Clock3 },
  { id: 'list', label: '목록', icon: List },
];

export function CalendarHeader({
  onOpenCreate,
  onOpenPanel,
  onOpenRooms,
  onViewChange,
  view,
}: {
  onOpenCreate: () => void;
  onOpenPanel: () => void;
  onOpenRooms: () => void;
  onViewChange: (view: CalendarViewMode) => void;
  view: CalendarViewMode;
}) {
  const activeLabel =
    viewItems.find((item) => item.id === view)?.label ?? '월간';
  return (
    <View className="shrink-0 flex-row flex-wrap items-center justify-between gap-3 border-b border-border bg-background/90 px-4 py-3 sm:px-6">
      <View className="flex-row flex-wrap items-center gap-3.5">
        <Pressable
          accessibilityLabel="캘린더 보조 패널 열기"
          className="size-8 items-center justify-center rounded-md border border-border xl:hidden"
          onPress={onOpenPanel}
        >
          <Icon as={PanelLeftOpen} className="size-4 text-muted-foreground" />
        </Pressable>
        <View className="flex-row items-center gap-1.5">
          <Text className="text-xs text-muted-foreground">회의일정</Text>
          <Text className="text-xs text-border">/</Text>
          <Text className="text-xs font-semibold">캘린더</Text>
          <Text className="hidden text-xs text-border sm:flex">/</Text>
          <Text className="hidden text-xs text-muted-foreground sm:flex">
            {activeLabel}
          </Text>
        </View>

        <View className="flex-row items-center rounded-lg border border-border bg-muted/60 p-0.5">
          {viewItems.map((item) => (
            <Pressable
              accessibilityLabel={`${item.label} 보기`}
              accessibilityState={{ selected: view === item.id }}
              className={cn(
                'flex-row items-center gap-1.5 rounded-md px-2.5 py-1',
                view === item.id && 'bg-background shadow-sm shadow-black/5',
              )}
              key={item.id}
              onPress={() => onViewChange(item.id)}
            >
              <Icon as={item.icon} className="size-3.5 text-muted-foreground" />
              <Text className="hidden text-xs sm:flex">{item.label}</Text>
            </Pressable>
          ))}
        </View>

        <Button
          className="h-8 gap-1.5"
          onPress={onOpenRooms}
          size="sm"
          variant="outline"
        >
          <Icon as={Building2} className="size-3.5" />
          <Text className="text-xs">회의실 현황</Text>
        </Button>
      </View>

      <Button className="h-8 gap-1.5" onPress={onOpenCreate} size="sm">
        <Icon as={Plus} className="size-3.5 text-primary-foreground" />
        <Text className="text-xs text-primary-foreground">새 회의 예약</Text>
      </Button>
    </View>
  );
}
