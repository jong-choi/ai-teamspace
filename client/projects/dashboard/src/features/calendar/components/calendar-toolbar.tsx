import { Pressable, ScrollView, View } from 'react-native';

import { Icon } from '@repo/client/rnr/components/ui/icon';
import { Input } from '@repo/client/rnr/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@repo/client/rnr/components/ui/select';
import { Skeleton } from '@repo/client/rnr/components/ui/skeleton';
import { Text } from '@repo/client/rnr/components/ui/text';
import { cn } from '@repo/client/rnr/lib/utils';
import { DashboardQueryBoundary } from '@core/app/state/dashboard-query-state';
import { useCalendarRooms } from '@core/features/calendar/calendar-queries';
import {
  CALENDAR_CATEGORIES,
  CALENDAR_CATEGORY_META,
  type CalendarCategory,
} from '@core/features/calendar/lib/calendar-category';

import { ChevronLeft, ChevronRight, Search } from 'lucide-react-native';

export function CalendarToolbar({
  category,
  onCategoryChange,
  onNext,
  onPrevious,
  onRoomChange,
  onSearchChange,
  onToday,
  periodTitle,
  roomId,
  organizationId,
  search,
}: {
  category: CalendarCategory | 'all';
  onCategoryChange: (category: CalendarCategory | 'all') => void;
  onNext: () => void;
  onPrevious: () => void;
  onRoomChange: (roomId: string | null) => void;
  onSearchChange: (value: string) => void;
  onToday: () => void;
  periodTitle: string;
  roomId: string | null;
  organizationId: string;
  search: string;
}) {
  return (
    <View className="shrink-0 gap-3 border-b border-border bg-muted/20 px-4 py-2.5 md:flex-row md:items-center md:justify-between sm:px-6">
      <View className="flex-row items-center gap-2">
        <View className="flex-row items-center rounded-md border border-border bg-background p-0.5">
          <Pressable
            accessibilityLabel="이전 기간"
            className="size-7 items-center justify-center rounded web:hover:bg-accent"
            onPress={onPrevious}
          >
            <Icon as={ChevronLeft} className="size-3.5 text-muted-foreground" />
          </Pressable>
          <Pressable
            className="rounded px-2 py-1 web:hover:bg-accent"
            onPress={onToday}
          >
            <Text className="text-xs font-semibold">오늘</Text>
          </Pressable>
          <Pressable
            accessibilityLabel="다음 기간"
            className="size-7 items-center justify-center rounded web:hover:bg-accent"
            onPress={onNext}
          >
            <Icon
              as={ChevronRight}
              className="size-3.5 text-muted-foreground"
            />
          </Pressable>
        </View>
        <Text className="ml-1 text-sm font-bold">{periodTitle}</Text>
      </View>

      <View className="min-w-0 flex-1 gap-2 md:max-w-xl md:flex-row md:items-center md:justify-end">
        <View className="relative min-w-[180px] flex-1">
          <Icon
            as={Search}
            className="pointer-events-none absolute left-2.5 top-2.5 z-10 size-3.5 text-muted-foreground"
          />
          <Input
            accessibilityLabel="회의 일정 검색"
            className="h-8 py-1 pl-8 text-xs sm:h-8 md:text-xs"
            maxLength={100}
            onChangeText={onSearchChange}
            placeholder="회의명, 참석자, 장소 검색..."
            value={search}
          />
        </View>
        <ScrollView
          className="max-w-full"
          contentContainerClassName="flex-row gap-1.5"
          horizontal
          showsHorizontalScrollIndicator={false}
        >
          <FilterChip
            active={category === 'all'}
            label="전체"
            onPress={() => onCategoryChange('all')}
          />
          {CALENDAR_CATEGORIES.map((item) => (
            <FilterChip
              active={category === item}
              category={item}
              key={item}
              label={CALENDAR_CATEGORY_META[item].label}
              onPress={() => onCategoryChange(item)}
            />
          ))}
        </ScrollView>
        <DashboardQueryBoundary
          fallback={
            <Skeleton
              accessibilityLabel="회의실 목록을 불러오는 중..."
              className="h-8 w-44"
            />
          }
          resetKeys={[organizationId]}
          title="회의실 목록을 불러오지 못했습니다"
        >
          <CalendarRoomFilter
            organizationId={organizationId}
            roomId={roomId}
            onRoomChange={onRoomChange}
          />
        </DashboardQueryBoundary>
      </View>
    </View>
  );
}

function FilterChip({
  active,
  category,
  label,
  onPress,
}: {
  active: boolean;
  category?: CalendarCategory;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityLabel={`${label} 필터`}
      accessibilityState={{ selected: active }}
      className={cn(
        'flex-row items-center gap-1 rounded-md border border-border px-2.5 py-1',
        active && 'bg-foreground',
      )}
      onPress={onPress}
    >
      <View
        className={cn(
          'size-1.5 rounded-full bg-zinc-400',
          category && CALENDAR_CATEGORY_META[category].dotClassName,
        )}
      />
      <Text
        className={cn(
          'text-[10px] font-medium text-muted-foreground',
          active && 'text-background',
        )}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function CalendarRoomFilter({
  organizationId,
  roomId,
  onRoomChange,
}: {
  organizationId: string;
  roomId: string | null;
  onRoomChange: (value: string | null) => void;
}) {
  const rooms = useCalendarRooms(organizationId).data.items;
  const selectedRoom = rooms.find((room) => room.id === roomId) ?? null;
  return (
    <View className="min-w-[150px] md:w-44">
      <Select
        onValueChange={(option) =>
          onRoomChange(
            !option?.value || option.value === 'all' ? null : option.value,
          )
        }
        value={
          selectedRoom
            ? { label: selectedRoom.name, value: selectedRoom.id }
            : { label: '모든 회의실', value: 'all' }
        }
      >
        <SelectTrigger
          accessibilityLabel="회의실 필터"
          className="h-8 w-full px-2 py-1 sm:h-8 sm:py-1"
          size="sm"
        >
          <SelectValue className="text-xs" placeholder="회의실" />
        </SelectTrigger>
        <SelectContent side="bottom">
          <SelectItem
            className="py-1 sm:py-1"
            textClassName="text-xs"
            label="모든 회의실"
            value="all"
          >
            <Text className="text-xs">모든 회의실</Text>
          </SelectItem>
          {rooms.map((room) => (
            <SelectItem
              className="py-1 sm:py-1"
              textClassName="text-xs"
              key={room.id}
              label={room.name}
              value={room.id}
            >
              <Text className="text-xs">
                {room.name}
                {room.active ? '' : ' · 비활성'}
              </Text>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </View>
  );
}
