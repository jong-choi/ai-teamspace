import { Pressable, View } from 'react-native';

import type {
  MeetingRoom,
  MeetingSummary,
} from '@repo/client/api-client/schemas';
import { Icon } from '@repo/client/rnr/components/ui/icon';
import { Skeleton } from '@repo/client/rnr/components/ui/skeleton';
import { Text } from '@repo/client/rnr/components/ui/text';
import { cn } from '@repo/client/rnr/lib/utils';
import {
  DashboardLoading,
  DashboardQueryBoundary,
} from '@core/app/state/dashboard-query-state';
import { useCalendarRooms } from '@core/features/calendar/calendar-queries';
import { MiniCalendar } from '@core/features/calendar/components/mini-calendar';
import { CALENDAR_CATEGORY_META } from '@core/features/calendar/lib/calendar-category';
import {
  getMeetingAttendeeCount,
  getMeetingDateKeys,
  getMeetingLocationLabel,
  getMeetingTimeLabel,
} from '@core/features/calendar/lib/calendar-meeting';

import {
  Building2,
  ChevronRight,
  MapPin,
  Monitor,
  Users,
} from 'lucide-react-native';

export function CalendarMiniPanel({
  currentDateKey,
  meetings,
  loading = false,
  onOpenMeeting,
  onOpenRooms,
  onSelectDate,
  rooms,
  organizationId,
  timeZone,
  todayDateKey,
}: {
  currentDateKey: string;
  meetings: readonly MeetingSummary[];
  loading?: boolean;
  onOpenMeeting: (meetingId: string) => void;
  onOpenRooms: () => void;
  onSelectDate: (dateKey: string) => void;
  rooms: readonly MeetingRoom[];
  organizationId?: string;
  timeZone: string;
  todayDateKey: string;
}) {
  const now = Date.now();
  const upcoming = meetings
    .filter(
      (meeting) =>
        meeting.canceledAt === null &&
        new Date(meeting.startAt).getTime() >= now,
    )
    .sort((left, right) => left.startAt.localeCompare(right.startAt))[0];
  const upcomingMeta = upcoming
    ? CALENDAR_CATEGORY_META[upcoming.category]
    : null;
  const meetingDateKeys = new Set(
    meetings
      .filter((meeting) => meeting.canceledAt === null)
      .flatMap((meeting) => getMeetingDateKeys(meeting, timeZone)),
  );

  return (
    <View className="gap-5">
      <MiniCalendar
        currentDateKey={currentDateKey}
        meetingDateKeys={meetingDateKeys}
        onSelectDate={onSelectDate}
        todayDateKey={todayDateKey}
      />

      <View className="gap-1.5">
        <Text className="px-1 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
          다가오는 일정
        </Text>
        {loading ? (
          <Skeleton className="h-28 w-full" />
        ) : upcoming && upcomingMeta ? (
          <Pressable
            className="rounded-xl border border-border bg-card p-3 shadow-sm shadow-black/5 web:hover:bg-accent/30"
            onPress={() => onOpenMeeting(upcoming.id)}
          >
            <View className="mb-2 flex-row items-center justify-between gap-2">
              <View
                className={`flex-row items-center gap-1 rounded-full border px-2 py-0.5 ${upcomingMeta.badgeClassName}`}
              >
                <View
                  className={`size-1.5 rounded-full ${upcomingMeta.dotClassName}`}
                />
                <Text
                  className={cn(
                    'text-2xs font-semibold',
                    upcomingMeta.badgeTextClassName,
                  )}
                >
                  다음 회의
                </Text>
              </View>
              <Text className="font-mono text-2xs text-muted-foreground">
                {getMeetingTimeLabel(upcoming, timeZone)}
              </Text>
            </View>
            <Text className="text-xs font-bold" numberOfLines={2}>
              {upcoming.title}
            </Text>
            <View className="mt-1.5 flex-row items-center gap-1">
              <Icon
                as={upcoming.locationType === 'online' ? Monitor : MapPin}
                className="size-3 text-muted-foreground"
              />
              <Text
                className="min-w-0 flex-1 text-2xs text-muted-foreground"
                numberOfLines={1}
              >
                {getMeetingLocationLabel(upcoming)}
              </Text>
            </View>
            <View className="mt-2 flex-row items-center justify-between border-t border-border/60 pt-2">
              <View className="flex-row items-center gap-1">
                <Icon as={Users} className="size-3 text-muted-foreground" />
                <Text className="text-2xs text-muted-foreground">
                  {getMeetingAttendeeCount(upcoming)}명
                </Text>
              </View>
              <View className="flex-row items-center gap-0.5">
                <Text className="text-2xs font-medium text-muted-foreground">
                  상세 보기
                </Text>
                <Icon
                  as={ChevronRight}
                  className="size-3 text-muted-foreground"
                />
              </View>
            </View>
          </Pressable>
        ) : (
          <View className="rounded-lg border border-dashed border-border px-3 py-4">
            <Text className="text-xs text-muted-foreground">
              예정된 회의가 없습니다.
            </Text>
          </View>
        )}
      </View>

      {organizationId ? (
        <DashboardQueryBoundary
          fallback={
            <DashboardLoading
              className="min-h-20 flex-none"
              label="회의실 현황"
            />
          }
          resetKeys={[organizationId]}
        >
          <CalendarMiniRooms
            organizationId={organizationId}
            onOpenRooms={onOpenRooms}
          />
        </DashboardQueryBoundary>
      ) : (
        <CalendarMiniRoomsView rooms={rooms} onOpenRooms={onOpenRooms} />
      )}
    </View>
  );
}

function CalendarMiniRooms({
  organizationId,
  onOpenRooms,
}: {
  organizationId: string;
  onOpenRooms: () => void;
}) {
  const rooms = useCalendarRooms(organizationId).data.items;
  return <CalendarMiniRoomsView rooms={rooms} onOpenRooms={onOpenRooms} />;
}
function CalendarMiniRoomsView({
  rooms,
  onOpenRooms,
}: Pick<
  React.ComponentProps<typeof CalendarMiniPanel>,
  'rooms' | 'onOpenRooms'
>) {
  return (
    <View className="gap-2">
      <View className="flex-row items-center justify-between px-1">
        <Text className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
          회의실 현황
        </Text>
        <Pressable
          className="flex-row items-center gap-0.5"
          onPress={onOpenRooms}
        >
          <Text className="text-2xs text-muted-foreground">전체 보기</Text>
          <Icon as={ChevronRight} className="size-3 text-muted-foreground" />
        </Pressable>
      </View>
      {rooms.slice(0, 4).map((room) => (
        <Pressable
          className="rounded-lg border border-border bg-card p-2 web:hover:border-muted-foreground/50"
          key={room.id}
          onPress={onOpenRooms}
        >
          <View className="flex-row items-center justify-between gap-2">
            <View className="min-w-0 flex-1">
              <Text className="truncate text-xs font-semibold">
                {room.name}
              </Text>
              <View className="mt-0.5 flex-row items-center gap-1.5">
                <Icon as={Users} className="size-3 text-muted-foreground" />
                <Text className="text-2xs text-muted-foreground">
                  {room.capacity}인{room.floor ? ` · ${room.floor}` : ''}
                </Text>
              </View>
            </View>
            <View className="flex-row items-center gap-1">
              <View
                className={`size-1.5 rounded-full ${room.active ? 'bg-emerald-500' : 'bg-muted-foreground/50'}`}
              />
              <Text className="text-3xs text-muted-foreground">
                {room.active ? '활성' : '비활성'}
              </Text>
            </View>
          </View>
        </Pressable>
      ))}
      {rooms.length === 0 ? (
        <View className="rounded-lg border border-dashed border-border p-3">
          <View className="flex-row items-center gap-2">
            <Icon as={Building2} className="size-4 text-muted-foreground" />
            <Text className="text-xs text-muted-foreground">
              등록된 회의실이 없습니다.
            </Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}
