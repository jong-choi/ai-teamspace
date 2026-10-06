import { Pressable, View } from 'react-native';

import type { MeetingSummary } from '@repo/client/api-client/schemas';
import { Icon } from '@repo/client/rnr/components/ui/icon';
import { Text } from '@repo/client/rnr/components/ui/text';
import { cn } from '@repo/client/rnr/lib/utils';
import { CALENDAR_CATEGORY_META } from '@core/features/calendar/lib/calendar-category';
import { formatDateKeyLabel } from '@core/features/calendar/lib/calendar-format';
import {
  getMeetingAttendeeCount,
  getMeetingLocationLabel,
  getMeetingTimeLabel,
  groupMeetingsByDate,
} from '@core/features/calendar/lib/calendar-meeting';

import { ChevronRight, MapPin, Monitor, Users } from 'lucide-react-native';

export function CalendarListView({
  meetings,
  onOpenMeeting,
  timeZone,
  todayDateKey,
}: {
  meetings: readonly MeetingSummary[];
  onOpenMeeting: (meetingId: string) => void;
  timeZone: string;
  todayDateKey: string;
}) {
  const groups = [...groupMeetingsByDate(meetings, timeZone).entries()].sort(
    ([left], [right]) => left.localeCompare(right),
  );

  if (groups.length === 0) {
    return (
      <View className="items-center rounded-xl border border-border bg-card px-6 py-16">
        <Text className="text-sm font-semibold">
          일치하는 회의 일정이 없습니다
        </Text>
        <Text className="mt-1 text-xs text-muted-foreground">
          검색 조건 또는 카테고리 필터를 변경해 보세요.
        </Text>
      </View>
    );
  }

  return (
    <View className="gap-6">
      {groups.map(([dateKey, items]) => (
        <View className="gap-2.5" key={dateKey}>
          <View className="flex-row items-center gap-2.5 px-1">
            <View
              className={cn(
                'rounded-md bg-secondary px-2 py-1',
                dateKey === todayDateKey && 'bg-emerald-500',
              )}
            >
              <Text
                className={cn(
                  'text-[11px] font-semibold',
                  dateKey === todayDateKey
                    ? 'text-white'
                    : 'text-secondary-foreground',
                )}
              >
                {formatDateKeyLabel(dateKey)}
              </Text>
            </View>
            <View className="h-px flex-1 bg-border" />
            <Text className="font-mono text-[10px] text-muted-foreground">
              {items.length}건
            </Text>
          </View>

          {items.map((meeting) => {
            const meta = CALENDAR_CATEGORY_META[meeting.category];
            const canceled = meeting.canceledAt !== null;
            const timeLabel = getMeetingTimeLabel(meeting, timeZone);
            return (
              <Pressable
                className={cn(
                  'flex-col items-stretch justify-between gap-3 rounded-xl border border-border bg-card p-4 shadow-sm shadow-black/5 web:hover:border-muted-foreground/50 sm:flex-row sm:items-center',
                  canceled && 'opacity-60',
                )}
                key={meeting.id}
                onPress={() => onOpenMeeting(meeting.id)}
              >
                <View className="min-w-0 flex-1 flex-row items-start gap-3.5">
                  <View className="w-24 shrink-0 items-center rounded-lg border border-border bg-secondary/70 p-2">
                    <Text className="font-mono text-xs font-bold">
                      {timeLabel.split(' – ')[0]}
                    </Text>
                    <Text className="font-mono text-[10px] text-muted-foreground">
                      {timeLabel.split(' – ')[1]}
                    </Text>
                  </View>
                  <View className="min-w-0 flex-1 gap-1">
                    <View className="flex-row items-center gap-2">
                      <View
                        className={cn(
                          'rounded-full border px-2 py-0.5',
                          meta.badgeClassName,
                        )}
                      >
                        <Text
                          className={cn(
                            'text-[10px] font-semibold',
                            meta.badgeTextClassName,
                          )}
                        >
                          {meta.label}
                        </Text>
                      </View>
                      {meeting.project ? (
                        <Text className="truncate rounded bg-secondary px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                          {meeting.project.name}
                        </Text>
                      ) : null}
                      {canceled ? (
                        <Text className="rounded bg-rose-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-rose-500">
                          취소됨
                        </Text>
                      ) : null}
                    </View>
                    <Text
                      className={cn(
                        'truncate text-sm font-bold',
                        canceled && 'line-through',
                      )}
                      numberOfLines={1}
                    >
                      {meeting.title}
                    </Text>
                    <View className="flex-row flex-wrap items-center gap-3">
                      <View className="flex-row items-center gap-1">
                        <Icon
                          as={
                            meeting.locationType === 'online' ? Monitor : MapPin
                          }
                          className="size-3.5 text-muted-foreground"
                        />
                        <Text className="text-xs text-muted-foreground">
                          {getMeetingLocationLabel(meeting)}
                        </Text>
                      </View>
                      <View className="flex-row items-center gap-1">
                        <Icon
                          as={Users}
                          className="size-3.5 text-muted-foreground"
                        />
                        <Text className="text-xs text-muted-foreground">
                          참석자 {getMeetingAttendeeCount(meeting)}명
                        </Text>
                      </View>
                    </View>
                  </View>
                </View>
                <Icon
                  as={ChevronRight}
                  className="size-4 shrink-0 text-muted-foreground"
                />
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}
