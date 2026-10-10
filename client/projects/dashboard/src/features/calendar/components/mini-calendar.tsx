import { Pressable, View } from 'react-native';

import { Icon } from '@repo/client/rnr/components/ui/icon';
import { Text } from '@repo/client/rnr/components/ui/text';
import { cn } from '@repo/client/rnr/lib/utils';
import {
  addCalendarMonths,
  CALENDAR_WEEKDAYS_KO,
  calendarWeekdayTextClass,
  dayOfMonth,
  getMiniCalendarDateKeys,
  isDateKeyInSameMonth,
} from '@core/features/calendar/lib/calendar-date-key';
import { getPeriodTitle } from '@core/features/calendar/lib/calendar-range';

import { ChevronLeft, ChevronRight } from 'lucide-react-native';

export function MiniCalendar({
  currentDateKey,
  meetingDateKeys,
  onSelectDate,
  todayDateKey,
}: {
  currentDateKey: string;
  meetingDateKeys: ReadonlySet<string>;
  onSelectDate: (dateKey: string) => void;
  todayDateKey: string;
}) {
  const dates = getMiniCalendarDateKeys(currentDateKey);
  const rows = Array.from({ length: Math.ceil(dates.length / 7) }, (_, row) =>
    dates.slice(row * 7, row * 7 + 7),
  );

  return (
    <View className="rounded-xl border border-border bg-card p-3 shadow-sm shadow-black/5">
      <View className="mb-3 flex-row items-center justify-between">
        <Text className="text-xs font-bold">
          {getPeriodTitle('month', currentDateKey)}
        </Text>
        <View className="flex-row items-center gap-1">
          <Pressable
            accessibilityLabel="이전 달"
            className="size-7 items-center justify-center rounded-md web:hover:bg-accent"
            onPress={() => onSelectDate(addCalendarMonths(currentDateKey, -1))}
          >
            <Icon as={ChevronLeft} className="size-3.5 text-muted-foreground" />
          </Pressable>
          <Pressable
            accessibilityLabel="다음 달"
            className="size-7 items-center justify-center rounded-md web:hover:bg-accent"
            onPress={() => onSelectDate(addCalendarMonths(currentDateKey, 1))}
          >
            <Icon
              as={ChevronRight}
              className="size-3.5 text-muted-foreground"
            />
          </Pressable>
        </View>
      </View>

      <View className="mb-1 flex-row">
        {CALENDAR_WEEKDAYS_KO.map((weekday, index) => (
          <View className="flex-1 items-center" key={weekday}>
            <Text
              className={cn(
                'text-3xs font-medium text-muted-foreground',
                calendarWeekdayTextClass(index),
              )}
            >
              {weekday}
            </Text>
          </View>
        ))}
      </View>

      {rows.map((row, index) => (
        <View className="flex-row" key={`mini-row-${index}`}>
          {row.map((dateKey) => {
            const currentMonth = isDateKeyInSameMonth(dateKey, currentDateKey);
            if (!currentMonth) {
              return <View className="flex-1 py-0.5" key={dateKey} />;
            }

            const selected = dateKey === currentDateKey;
            const today = dateKey === todayDateKey;
            const hasMeeting = meetingDateKeys.has(dateKey);
            return (
              <Pressable
                accessibilityLabel={dateKey}
                accessibilityState={{ selected }}
                className="flex-1 items-center py-0.5"
                key={dateKey}
                onPress={() => onSelectDate(dateKey)}
              >
                <View
                  className={cn(
                    'relative size-6 items-center justify-center rounded',
                    selected && 'bg-foreground',
                    today && !selected && 'border border-emerald-500',
                  )}
                >
                  <Text
                    className={cn(
                      'text-xs font-medium',
                      selected && 'text-background',
                      today && !selected && 'font-semibold text-emerald-500',
                    )}
                  >
                    {dayOfMonth(dateKey)}
                  </Text>
                  {hasMeeting ? (
                    <View
                      className={cn(
                        'absolute bottom-0.5 size-1 rounded-full bg-emerald-500',
                        selected && 'bg-emerald-400',
                      )}
                    />
                  ) : null}
                </View>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}
