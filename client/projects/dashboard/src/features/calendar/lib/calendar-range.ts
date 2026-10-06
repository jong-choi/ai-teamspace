import {
  addCalendarDays,
  addCalendarMonths,
  getMonthGridDateKeys,
  parseDateKey,
  startOfWeekDateKey,
  toDateKey,
  toDateKeyFromParts,
} from '@core/features/calendar/lib/calendar-date-key';
import { zonedDateTimeToIso } from '@core/features/calendar/lib/calendar-time-zone';

export type CalendarViewMode = 'month' | 'week' | 'day' | 'list';

export type CalendarQueryRange = {
  from: string;
  to: string;
  title: string;
};

export function getCalendarQueryRange(
  view: CalendarViewMode,
  currentDateKey: string,
  timeZone: string,
): CalendarQueryRange {
  const current = parseDateKey(currentDateKey);
  let fromDateKey: string;
  let toDateKey: string;

  if (view === 'month') {
    const visible = getMonthGridDateKeys(currentDateKey);
    const first = visible[0];
    const last = visible.at(-1);
    if (!first || !last) {
      throw new Error('월간 캘린더 범위를 계산할 수 없습니다.');
    }
    fromDateKey = first;
    toDateKey = addCalendarDays(last, 1);
  } else if (view === 'week') {
    fromDateKey = startOfWeekDateKey(currentDateKey);
    toDateKey = addCalendarDays(fromDateKey, 7);
  } else if (view === 'day') {
    fromDateKey = currentDateKey;
    toDateKey = addCalendarDays(currentDateKey, 1);
  } else {
    fromDateKey = toDateKeyFromParts({
      year: current.year,
      month: current.month,
      day: 1,
    });
    toDateKey = addCalendarMonths(fromDateKey, 1);
  }

  return {
    from: zonedDateTimeToIso(fromDateKey, '00:00', timeZone),
    to: zonedDateTimeToIso(toDateKey, '00:00', timeZone),
    title: getPeriodTitle(view, currentDateKey),
  };
}

export function getPeriodTitle(
  view: CalendarViewMode,
  currentDateKey: string,
): string {
  const current = parseDateKey(currentDateKey);
  if (view === 'month') return `${current.year}년 ${current.month}월`;
  if (view === 'day') {
    return `${current.year}년 ${current.month}월 ${current.day}일`;
  }
  if (view === 'list') return `${current.year}년 ${current.month}월 일정`;

  const start = parseDateKey(startOfWeekDateKey(currentDateKey));
  const end = parseDateKey(addCalendarDays(toDateKey(start), 6));
  if (start.year !== end.year) {
    return `${start.year}년 ${start.month}월 ${start.day}일 – ${end.year}년 ${end.month}월 ${end.day}일`;
  }
  if (start.month === end.month) {
    return `${start.year}년 ${start.month}월 ${start.day}일 – ${end.day}일`;
  }
  return `${start.year}년 ${start.month}월 ${start.day}일 – ${end.month}월 ${end.day}일`;
}

export function shiftCalendarPeriod(
  currentDateKey: string,
  view: CalendarViewMode,
  direction: -1 | 1,
): string {
  if (view === 'month' || view === 'list') {
    return addCalendarMonths(currentDateKey, direction);
  }
  if (view === 'week') return addCalendarDays(currentDateKey, direction * 7);
  return addCalendarDays(currentDateKey, direction);
}
