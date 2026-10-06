import { Pressable, ScrollView, View } from 'react-native';

import type { MeetingSummary } from '@repo/client/api-client/schemas';
import { Icon } from '@repo/client/rnr/components/ui/icon';
import { Text } from '@repo/client/rnr/components/ui/text';
import { cn } from '@repo/client/rnr/lib/utils';
import { CALENDAR_CATEGORY_META } from '@core/features/calendar/lib/calendar-category';
import {
  CALENDAR_WEEKDAYS_KO,
  dayOfMonth,
  getPeriodTitle,
  getWeekDateKeys,
  weekdayIndex,
} from '@core/features/calendar/lib/calendar-datetime';
import {
  getMeetingAttendeeCount,
  getMeetingLocationLabel,
  getMeetingTimeLabel,
  groupMeetingsByDate,
} from '@core/features/calendar/lib/calendar-meeting';
import {
  CALENDAR_TIMELINE_END_HOUR,
  CALENDAR_TIMELINE_HOUR_HEIGHT,
  CALENDAR_TIMELINE_START_HOUR,
  createCalendarTimelineLayouts,
} from '@core/features/calendar/lib/calendar-timeline';

import { MapPin, Monitor, Users } from 'lucide-react-native';

const hours = Array.from(
  { length: CALENDAR_TIMELINE_END_HOUR - CALENDAR_TIMELINE_START_HOUR },
  (_, index) => index + CALENDAR_TIMELINE_START_HOUR,
);
const timelineHeight = hours.length * CALENDAR_TIMELINE_HOUR_HEIGHT;

export function CalendarWeekView(props: TimelineViewProps) {
  const dates = getWeekDateKeys(props.currentDateKey);
  return <TimelineView {...props} dates={dates} week />;
}

export function CalendarDayView(props: TimelineViewProps) {
  return (
    <TimelineView {...props} dates={[props.currentDateKey]} week={false} />
  );
}

type TimelineViewProps = {
  currentDateKey: string;
  meetings: readonly MeetingSummary[];
  onCreateMeeting: (dateKey: string, time?: string) => void;
  onOpenMeeting: (meetingId: string) => void;
  timeZone: string;
  todayDateKey: string;
};

function TimelineView({
  currentDateKey,
  dates,
  meetings,
  onCreateMeeting,
  onOpenMeeting,
  timeZone,
  todayDateKey,
  week,
}: TimelineViewProps & { dates: string[]; week: boolean }) {
  const grouped = groupMeetingsByDate(meetings, timeZone, {
    includeSpanningDates: true,
  });
  const currentDayMeetings = grouped.get(currentDateKey) ?? [];
  const minWidth = week ? 920 : 560;

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <View
        className="overflow-hidden rounded-xl border border-border bg-card shadow-sm shadow-black/5"
        style={{ minWidth }}
      >
        {week ? (
          <View className="flex-row border-b border-border bg-muted/40">
            <View className="w-20 items-center justify-center border-r border-border px-2 py-3">
              <Text className="font-mono text-[10px] text-muted-foreground">
                시간
              </Text>
            </View>
            {dates.map((dateKey) => {
              const today = dateKey === todayDateKey;
              const weekday = weekdayIndex(dateKey);
              return (
                <View className="flex-1 items-center px-2 py-2" key={dateKey}>
                  <Text
                    className={cn(
                      'text-[10px] text-muted-foreground',
                      weekday === 0 && 'text-rose-500',
                      weekday === 6 && 'text-blue-500',
                    )}
                  >
                    {CALENDAR_WEEKDAYS_KO[weekday]}
                  </Text>
                  <View
                    className={cn(
                      'mt-0.5 size-7 items-center justify-center rounded-md',
                      today && 'bg-emerald-500',
                    )}
                  >
                    <Text
                      className={cn(
                        'text-xs font-bold',
                        today ? 'text-white' : 'text-foreground',
                      )}
                    >
                      {dayOfMonth(dateKey)}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        ) : (
          <View className="flex-row items-center justify-between gap-3 border-b border-border bg-muted/30 px-6 py-4">
            <View className="min-w-0 flex-1 flex-row items-center gap-3">
              <View
                className={cn(
                  'size-8 items-center justify-center rounded-lg bg-secondary',
                  currentDateKey === todayDateKey && 'bg-emerald-500',
                )}
              >
                <Text
                  className={cn(
                    'text-sm font-bold',
                    currentDateKey === todayDateKey
                      ? 'text-white'
                      : 'text-secondary-foreground',
                  )}
                >
                  {dayOfMonth(currentDateKey)}
                </Text>
              </View>
              <View className="min-w-0 flex-1">
                <Text className="text-sm font-bold">
                  {getPeriodTitle('day', currentDateKey)} (
                  {CALENDAR_WEEKDAYS_KO[weekdayIndex(currentDateKey)]}요일)
                </Text>
                <Text className="mt-0.5 text-xs text-muted-foreground">
                  총 {currentDayMeetings.length}개의 회의 일정이 등록되어
                  있습니다.
                </Text>
              </View>
            </View>
            <Pressable
              className="rounded-md bg-foreground px-3 py-1.5 shadow-sm shadow-black/5 web:hover:opacity-90"
              onPress={() => onCreateMeeting(currentDateKey)}
            >
              <Text className="text-xs font-medium text-background">
                + 새 회의 예약
              </Text>
            </Pressable>
          </View>
        )}

        <View className="flex-row">
          <View className="w-20 shrink-0 border-r border-border/70 bg-muted/10">
            {hours.map((hour) => (
              <View
                className="items-end border-b border-border/70 px-2 py-2"
                key={hour}
                style={{ height: CALENDAR_TIMELINE_HOUR_HEIGHT }}
              >
                <Text className="font-mono text-[10px] text-muted-foreground">
                  {String(hour).padStart(2, '0')}:00
                </Text>
              </View>
            ))}
          </View>

          {dates.map((dateKey) => {
            const dayMeetings = grouped.get(dateKey) ?? [];
            const layouts = createCalendarTimelineLayouts(
              dayMeetings,
              timeZone,
              dateKey,
            );
            return (
              <View
                className="relative flex-1 border-r border-border/50"
                key={dateKey}
                style={{ height: timelineHeight }}
              >
                {hours.map((hour) => {
                  const hourLabel = `${String(hour).padStart(2, '0')}:00`;
                  return (
                    <Pressable
                      accessibilityLabel={`${dateKey} ${hourLabel} 회의 예약`}
                      className="border-b border-border/70 web:hover:bg-muted/20"
                      key={`${dateKey}-${hour}`}
                      onPress={() => onCreateMeeting(dateKey, hourLabel)}
                      style={{ height: CALENDAR_TIMELINE_HOUR_HEIGHT }}
                    />
                  );
                })}

                {layouts.map((layout) => {
                  const laneWidth = 100 / layout.laneCount;
                  const laneLeft = layout.laneIndex * laneWidth;
                  return (
                    <View
                      className="absolute z-10 px-0.5 py-0.5"
                      key={layout.meeting.id}
                      pointerEvents="box-none"
                      style={{
                        height: layout.height,
                        left: `${laneLeft}%`,
                        top: layout.top,
                        width: `${laneWidth}%`,
                      }}
                    >
                      <TimelineMeetingEvent
                        height={layout.height}
                        meeting={layout.meeting}
                        onPress={onOpenMeeting}
                        timeZone={timeZone}
                        week={week}
                      />
                    </View>
                  );
                })}
              </View>
            );
          })}
        </View>
      </View>
    </ScrollView>
  );
}

function TimelineMeetingEvent({
  height,
  meeting,
  onPress,
  timeZone,
  week,
}: {
  height: number;
  meeting: MeetingSummary;
  onPress: (meetingId: string) => void;
  timeZone: string;
  week: boolean;
}) {
  const meta = CALENDAR_CATEGORY_META[meeting.category];
  const timeLabel = getMeetingTimeLabel(meeting, timeZone);
  const canceled = meeting.canceledAt !== null;
  const showMetadata = height >= 48;
  const showExtendedMetadata = !week && height >= 60;

  return (
    <Pressable
      accessibilityLabel={`${timeLabel} ${meeting.title}`}
      className={cn(
        'h-full overflow-hidden rounded-lg border px-2 py-1.5 shadow-sm shadow-black/5 web:hover:opacity-90',
        meta.chipClassName,
        canceled && 'opacity-50',
      )}
      onPress={() => onPress(meeting.id)}
    >
      {!week ? (
        <View className="mb-0.5 flex-row items-center justify-between gap-2">
          <View
            className={cn(
              'rounded-full border px-1.5 py-0.5',
              meta.badgeClassName,
            )}
          >
            <Text
              className={cn(
                'text-[9px] font-semibold',
                meta.badgeTextClassName,
              )}
            >
              {meta.label}
            </Text>
          </View>
          <Text className="font-mono text-[9px] text-muted-foreground">
            {timeLabel}
          </Text>
        </View>
      ) : null}

      <Text
        className={cn(
          'truncate text-[11px] font-bold text-foreground',
          canceled && 'line-through',
        )}
        numberOfLines={1}
      >
        {meeting.title}
      </Text>

      {week && showMetadata ? (
        <Text className="mt-0.5 font-mono text-[9px] text-muted-foreground">
          {timeLabel}
        </Text>
      ) : null}

      {showMetadata ? (
        <View className="mt-0.5 flex-row items-center gap-1">
          <Icon
            as={meeting.locationType === 'online' ? Monitor : MapPin}
            className="size-2.5 text-muted-foreground"
          />
          <Text
            className="min-w-0 flex-1 truncate text-[9px] text-muted-foreground"
            numberOfLines={1}
          >
            {getMeetingLocationLabel(meeting)}
          </Text>
        </View>
      ) : null}

      {showExtendedMetadata ? (
        <View className="mt-0.5 flex-row items-center gap-2">
          {meeting.project ? (
            <Text
              className="min-w-0 flex-1 truncate font-mono text-[9px] text-muted-foreground"
              numberOfLines={1}
            >
              {meeting.project.name}
            </Text>
          ) : (
            <View className="flex-1" />
          )}
          <View className="flex-row items-center gap-1">
            <Icon as={Users} className="size-2.5 text-muted-foreground" />
            <Text className="text-[9px] text-muted-foreground">
              {getMeetingAttendeeCount(meeting)}명
            </Text>
          </View>
        </View>
      ) : null}
    </Pressable>
  );
}
