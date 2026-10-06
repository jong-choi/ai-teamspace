import { Pressable, View } from 'react-native';

import { Input } from '@repo/client/rnr/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@repo/client/rnr/components/ui/select';
import { Text } from '@repo/client/rnr/components/ui/text';
import { cn } from '@repo/client/rnr/lib/utils';
import {
  CALENDAR_RECURRENCE_FREQUENCIES,
  CALENDAR_RECURRENCE_WEEKDAYS,
  type CalendarRecurrenceDraft,
  calendarRecurrenceFrequencyLabel,
  calendarRecurrenceWeekdayLabel,
  isCalendarRecurrenceFrequency,
} from '@core/features/calendar/lib/calendar-recurrence';

export type { CalendarRecurrenceDraft } from '@core/features/calendar/lib/calendar-recurrence';

export function CalendarRecurrenceFields({
  onChange,
  value,
}: {
  onChange: (draft: CalendarRecurrenceDraft) => void;
  value: CalendarRecurrenceDraft;
}) {
  return (
    <View className="gap-2 rounded-lg border border-border bg-muted/20 p-3">
      <View className="flex-row items-center justify-between gap-3">
        <View>
          <Text className="text-[11px] font-semibold">반복 일정</Text>
          <Text className="text-[10px] text-muted-foreground">
            서버가 지원하는 반복 규칙만 설정합니다.
          </Text>
        </View>
        <Pressable
          accessibilityLabel="반복 일정 사용"
          accessibilityRole="switch"
          accessibilityState={{ checked: value.enabled }}
          className={cn(
            'h-5 w-9 rounded-full bg-muted-foreground/30 p-0.5',
            value.enabled && 'bg-emerald-500',
          )}
          onPress={() => onChange({ ...value, enabled: !value.enabled })}
        >
          <View
            className={cn(
              'size-4 rounded-full bg-white shadow-sm',
              value.enabled && 'translate-x-4',
            )}
          />
        </Pressable>
      </View>

      {value.enabled ? (
        <View className="gap-2.5">
          <View className="gap-2 sm:flex-row">
            <View className="flex-1 gap-1">
              <Text className="text-[10px] text-muted-foreground">주기</Text>
              <Select
                onValueChange={(option) => {
                  const frequency = option?.value;
                  if (!frequency || !isCalendarRecurrenceFrequency(frequency))
                    return;
                  onChange({ ...value, frequency });
                }}
                value={{
                  label: calendarRecurrenceFrequencyLabel(value.frequency),
                  value: value.frequency,
                }}
              >
                <SelectTrigger className="w-full" size="sm">
                  <SelectValue placeholder="반복 주기" />
                </SelectTrigger>
                <SelectContent side="bottom">
                  {CALENDAR_RECURRENCE_FREQUENCIES.map((frequency) => (
                    <SelectItem
                      key={frequency}
                      label={calendarRecurrenceFrequencyLabel(frequency)}
                      value={frequency}
                    >
                      {calendarRecurrenceFrequencyLabel(frequency)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </View>
            <View className="w-full gap-1 sm:w-24">
              <Text className="text-[10px] text-muted-foreground">간격</Text>
              <Input
                className="h-8 font-mono text-xs"
                keyboardType="number-pad"
                onChangeText={(interval) => onChange({ ...value, interval })}
                value={value.interval}
              />
            </View>
          </View>

          {value.frequency === 'weekly' ? (
            <View className="gap-1">
              <Text className="text-[10px] text-muted-foreground">
                반복 요일
              </Text>
              <View className="flex-row flex-wrap gap-1">
                {CALENDAR_RECURRENCE_WEEKDAYS.map((weekday) => {
                  const selected = value.byWeekday.includes(weekday);
                  return (
                    <Pressable
                      accessibilityState={{ selected }}
                      className={cn(
                        'size-7 items-center justify-center rounded-md border border-border',
                        selected && 'border-emerald-500/30 bg-emerald-500/10',
                      )}
                      key={weekday}
                      onPress={() =>
                        onChange({
                          ...value,
                          byWeekday: selected
                            ? value.byWeekday.filter((item) => item !== weekday)
                            : [...value.byWeekday, weekday],
                        })
                      }
                    >
                      <Text
                        className={cn(
                          'text-[10px] font-semibold text-muted-foreground',
                          selected && 'text-emerald-600 dark:text-emerald-400',
                        )}
                      >
                        {calendarRecurrenceWeekdayLabel(weekday)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : null}

          <View className="gap-2 sm:flex-row">
            <View className="flex-1 gap-1">
              <Text className="text-[10px] text-muted-foreground">
                종료 방식
              </Text>
              <Select
                onValueChange={(option) => {
                  if (option?.value === 'count' || option?.value === 'until') {
                    onChange({ ...value, endMode: option.value });
                  }
                }}
                value={{
                  label: value.endMode === 'count' ? '횟수' : '날짜',
                  value: value.endMode,
                }}
              >
                <SelectTrigger className="w-full" size="sm">
                  <SelectValue placeholder="종료 방식" />
                </SelectTrigger>
                <SelectContent side="bottom">
                  <SelectItem label="횟수" value="count">
                    횟수
                  </SelectItem>
                  <SelectItem label="날짜" value="until">
                    날짜
                  </SelectItem>
                </SelectContent>
              </Select>
            </View>
            <View className="flex-1 gap-1">
              <Text className="text-[10px] text-muted-foreground">
                {value.endMode === 'count' ? '전체 횟수' : '종료 날짜'}
              </Text>
              <Input
                className="h-8 font-mono text-xs"
                keyboardType={
                  value.endMode === 'count' ? 'number-pad' : 'default'
                }
                onChangeText={(nextValue) =>
                  value.endMode === 'count'
                    ? onChange({ ...value, count: nextValue })
                    : onChange({ ...value, untilDate: nextValue })
                }
                placeholder={value.endMode === 'count' ? '4' : 'YYYY-MM-DD'}
                value={
                  value.endMode === 'count' ? value.count : value.untilDate
                }
              />
            </View>
          </View>
        </View>
      ) : null}
    </View>
  );
}
