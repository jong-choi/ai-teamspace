import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { Icon } from '@repo/client/rnr/components/ui/icon';
import { Select, SelectContent } from '@repo/client/rnr/components/ui/select';
import { Skeleton } from '@repo/client/rnr/components/ui/skeleton';
import { Text } from '@repo/client/rnr/components/ui/text';
import { cn } from '@repo/client/rnr/lib/utils';
import { DashboardQueryBoundary } from '@core/app/state/dashboard-query-state';
import { DashboardSearchInput } from '@core/app/ui/dashboard-search-input';
import {
  DashboardSelectItem,
  DashboardSelectTrigger,
  DashboardSelectValue,
} from '@core/app/ui/dashboard-select';
import { useCalendarRooms } from '@core/features/calendar/calendar-queries';
import {
  CALENDAR_CATEGORIES,
  CALENDAR_CATEGORY_META,
  type CalendarCategory,
} from '@core/features/calendar/lib/calendar-category';

import { ChevronLeft, ChevronRight } from 'lucide-react-native';

// 이동 버튼·기간 제목과 검색·분류·회의실을 한 줄에 놓을 수 있는 최소 너비다.
const SINGLE_ROW_MIN_WIDTH = 900;

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
  // Agent 패널이 열리면 창이 넓어도 본문은 좁다. 그래서 툴바가 실제로 받은 너비를 본다.
  const [width, setWidth] = useState<number | null>(null);
  const singleRow = width !== null && width >= SINGLE_ROW_MIN_WIDTH;

  return (
    <View
      className={cn(
        'shrink-0 gap-3 border-b border-border bg-muted/20 px-4 py-2.5 sm:px-6',
        singleRow && 'flex-row items-center justify-between',
      )}
      onLayout={({ nativeEvent }) => setWidth(nativeEvent.layout.width)}
    >
      <View className="shrink-0 flex-row items-center gap-2">
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

      <View
        className={cn(
          'min-w-0 gap-2',
          singleRow
            ? 'max-w-xl flex-1 flex-row items-center justify-end'
            : 'flex-row flex-wrap items-center',
        )}
      >
        <DashboardSearchInput
          accessibilityLabel="회의 일정 검색"
          className="min-w-[180px] flex-1"
          maxLength={100}
          onChangeText={onSearchChange}
          placeholder="회의명, 참석자, 장소 검색..."
          value={search}
        />
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
          'size-1.5 rounded-full bg-muted-foreground/50',
          category && CALENDAR_CATEGORY_META[category].dotClassName,
        )}
      />
      <Text
        className={cn(
          'text-2xs font-medium text-muted-foreground',
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
    <View className="w-44">
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
        <DashboardSelectTrigger
          accessibilityLabel="회의실 필터"
          className="w-full px-2 py-1 sm:py-1"
          size="sm"
        >
          <DashboardSelectValue placeholder="회의실" />
        </DashboardSelectTrigger>
        <SelectContent side="bottom">
          <DashboardSelectItem
            className="py-1 sm:py-1"
            textClassName="text-xs"
            label="모든 회의실"
            value="all"
          >
            <Text className="text-xs">모든 회의실</Text>
          </DashboardSelectItem>
          {rooms.map((room) => (
            <DashboardSelectItem
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
            </DashboardSelectItem>
          ))}
        </SelectContent>
      </Select>
    </View>
  );
}
