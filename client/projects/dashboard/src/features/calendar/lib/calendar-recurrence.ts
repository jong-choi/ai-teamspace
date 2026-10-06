import {
  type RecurrenceRule,
  RecurrenceRule as RecurrenceRuleSchema,
} from '@repo/client/api-client/schemas';
import {
  weekdayIndex,
  zonedDateTimeToIso,
} from '@core/features/calendar/lib/calendar-datetime';

export type CalendarRecurrenceDraft = {
  enabled: boolean;
  frequency: RecurrenceRule['frequency'];
  interval: string;
  endMode: 'count' | 'until';
  count: string;
  untilDate: string;
  byWeekday: NonNullable<RecurrenceRule['byWeekday']>;
};

export const CALENDAR_RECURRENCE_FREQUENCIES =
  RecurrenceRuleSchema.shape.frequency.options;
export const CALENDAR_RECURRENCE_WEEKDAYS =
  RecurrenceRuleSchema.shape.byWeekday.unwrap().element.options;

export type CalendarRecurrenceWeekday =
  (typeof CALENDAR_RECURRENCE_WEEKDAYS)[number];

export function createDefaultRecurrenceDraft(): CalendarRecurrenceDraft {
  return {
    enabled: false,
    frequency:
      CALENDAR_RECURRENCE_FREQUENCIES.find(
        (frequency) => frequency === 'weekly',
      ) ?? CALENDAR_RECURRENCE_FREQUENCIES[0],
    interval: '1',
    endMode: 'count',
    count: '4',
    untilDate: '',
    byWeekday: [],
  };
}

export function recurrenceDraftToContract(
  draft: CalendarRecurrenceDraft,
  timeZone: string,
  startDateKey?: string,
): RecurrenceRule | undefined {
  if (!draft.enabled) return undefined;
  const interval = Number(draft.interval);
  if (!Number.isInteger(interval) || interval < 1) {
    throw new Error('반복 간격은 1 이상의 정수여야 합니다.');
  }
  if (draft.endMode === 'count' && draft.count.trim().length === 0) {
    throw new Error('반복 횟수를 입력해 주세요.');
  }
  if (draft.endMode === 'until' && draft.untilDate.trim().length === 0) {
    throw new Error('반복 종료 날짜를 입력해 주세요.');
  }
  if (
    draft.frequency === 'weekly' &&
    startDateKey &&
    draft.byWeekday.length > 0 &&
    !draft.byWeekday.includes(weekdayCodeForDateKey(startDateKey))
  ) {
    throw new Error('첫 회의 날짜의 요일을 반복 요일에 포함해 주세요.');
  }
  const count = draft.endMode === 'count' ? Number(draft.count) : undefined;
  const until =
    draft.endMode === 'until'
      ? zonedDateTimeToIso(draft.untilDate, '23:59', timeZone)
      : undefined;

  return RecurrenceRuleSchema.parse({
    frequency: draft.frequency,
    interval,
    count,
    until,
    byWeekday: draft.frequency === 'weekly' ? draft.byWeekday : [],
    timeZone,
  });
}

export function isCalendarRecurrenceFrequency(
  value: string,
): value is RecurrenceRule['frequency'] {
  return CALENDAR_RECURRENCE_FREQUENCIES.some(
    (frequency) => frequency === value,
  );
}

export function calendarRecurrenceFrequencyLabel(
  frequency: RecurrenceRule['frequency'],
): string {
  if (frequency === 'daily') return '매일';
  if (frequency === 'monthly') return '매월';
  return '매주';
}

export function calendarRecurrenceWeekdayLabel(
  weekday: CalendarRecurrenceWeekday,
): string {
  if (weekday === 'MO') return '월';
  if (weekday === 'TU') return '화';
  if (weekday === 'WE') return '수';
  if (weekday === 'TH') return '목';
  if (weekday === 'FR') return '금';
  if (weekday === 'SA') return '토';
  return '일';
}

function weekdayCodeForDateKey(dateKey: string): CalendarRecurrenceWeekday {
  const codes: readonly CalendarRecurrenceWeekday[] = [
    'SU',
    'MO',
    'TU',
    'WE',
    'TH',
    'FR',
    'SA',
  ];
  return codes[weekdayIndex(dateKey)] ?? 'SU';
}
