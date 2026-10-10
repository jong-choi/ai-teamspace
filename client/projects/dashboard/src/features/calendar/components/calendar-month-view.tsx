import { Pressable, ScrollView, View } from 'react-native';

import type { MeetingSummary } from '@repo/client/api-client/schemas';
import { Skeleton } from '@repo/client/rnr/components/ui/skeleton';
import { Text } from '@repo/client/rnr/components/ui/text';
import { cn } from '@repo/client/rnr/lib/utils';
import { MeetingEvent } from '@core/features/calendar/components/meeting-event';
import {
  CALENDAR_WEEKDAYS_KO,
  calendarWeekdayTextClass,
  dayOfMonth,
  getMonthGridDateKeys,
  isDateKeyInSameMonth,
} from '@core/features/calendar/lib/calendar-date-key';
import { groupMeetingsByDate } from '@core/features/calendar/lib/calendar-meeting';

const minimumCalendarWidth = 720;

export function CalendarMonthView({
  currentDateKey,
  meetings,
  loading = false,
  onCreateMeeting,
  onOpenMeeting,
  onSelectDay,
  timeZone,
  todayDateKey,
}: {
  currentDateKey: string;
  meetings: readonly MeetingSummary[];
  loading?: boolean;
  onCreateMeeting: (dateKey: string) => void;
  onOpenMeeting: (meetingId: string) => void;
  onSelectDay: (dateKey: string) => void;
  timeZone: string;
  todayDateKey: string;
}) {
  const dateKeys = getMonthGridDateKeys(currentDateKey);
  const meetingsByDate = groupMeetingsByDate(meetings, timeZone, {
    includeSpanningDates: true,
  });
  const rows = Array.from(
    { length: Math.ceil(dateKeys.length / 7) },
    (_, row) => dateKeys.slice(row * 7, row * 7 + 7),
  );

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <View
        className="flex-1 overflow-hidden rounded-xl border border-border bg-card shadow-sm shadow-black/5"
        style={{ minWidth: minimumCalendarWidth }}
      >
        <View className="flex-row border-b border-border bg-muted/40 py-2.5">
          {CALENDAR_WEEKDAYS_KO.map((weekday, index) => (
            <View className="flex-1 items-center" key={weekday}>
              <Text
                className={cn(
                  'text-xs font-semibold text-muted-foreground',
                  calendarWeekdayTextClass(index),
                )}
              >
                {weekday}
              </Text>
            </View>
          ))}
        </View>

        {rows.map((row, rowIndex) => (
          <View className="min-h-[112px] flex-row" key={`row-${rowIndex}`}>
            {row.map((dateKey, columnIndex) => {
              const dayMeetings = meetingsByDate.get(dateKey) ?? [];
              const currentMonth = isDateKeyInSameMonth(
                dateKey,
                currentDateKey,
              );
              const today = dateKey === todayDateKey;
              return (
                <View
                  className={cn(
                    'group min-h-[112px] flex-1 border-border p-1.5 web:hover:bg-muted/30 sm:p-2',
                    columnIndex < 6 && 'border-r',
                    rowIndex < rows.length - 1 && 'border-b',
                    !currentMonth && 'bg-muted/20 opacity-60',
                  )}
                  key={dateKey}
                >
                  <View className="mb-1 flex-row items-center justify-between">
                    <Pressable
                      accessibilityLabel={`${dateKey} 일간 보기`}
                      className={cn(
                        'size-6 items-center justify-center rounded-md',
                        today && 'bg-emerald-500',
                      )}
                      onPress={() => onSelectDay(dateKey)}
                    >
                      <Text
                        className={cn(
                          'text-xs font-semibold',
                          today ? 'text-white' : 'text-foreground',
                        )}
                      >
                        {dayOfMonth(dateKey)}
                      </Text>
                    </Pressable>
                    <Pressable
                      accessibilityLabel={`${dateKey}에 회의 예약`}
                      className="size-6 items-center justify-center rounded-md web:opacity-0 web:transition-opacity web:group-hover:opacity-100 web:hover:bg-accent"
                      onPress={(event) => {
                        event.stopPropagation();
                        onCreateMeeting(dateKey);
                      }}
                    >
                      <Text className="text-sm text-muted-foreground">＋</Text>
                    </Pressable>
                  </View>
                  <View className="gap-1">
                    {loading ? <Skeleton className="mt-1 h-8 w-full" /> : null}
                    {dayMeetings.slice(0, 3).map((meeting) => (
                      <MeetingEvent
                        compact
                        key={meeting.id}
                        meeting={meeting}
                        onPress={onOpenMeeting}
                        timeZone={timeZone}
                      />
                    ))}
                    {dayMeetings.length > 3 ? (
                      <Pressable
                        accessibilityLabel={`${dateKey} 일정 더보기`}
                        className="rounded px-1 py-0.5 web:hover:bg-accent"
                        onPress={() => onSelectDay(dateKey)}
                      >
                        <Text className="text-2xs font-medium text-muted-foreground">
                          +{dayMeetings.length - 3}개 더보기
                        </Text>
                      </Pressable>
                    ) : null}
                  </View>
                </View>
              );
            })}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}
