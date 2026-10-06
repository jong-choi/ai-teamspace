import {
  CALENDAR_WEEKDAYS_KO,
  parseDateKey,
  weekdayIndex,
} from '@core/features/calendar/lib/calendar-date-key';
import { dateKeyInTimeZone } from '@core/features/calendar/lib/calendar-time-zone';

const timeFormatterByZone = new Map<string, Intl.DateTimeFormat>();
const dateTimeFormatterByZone = new Map<string, Intl.DateTimeFormat>();

export function formatInstantTime(instant: string, timeZone: string): string {
  let formatter = timeFormatterByZone.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('ko-KR', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
    timeFormatterByZone.set(timeZone, formatter);
  }
  return formatter.format(new Date(instant));
}

export function formatInstantDateTime(
  instant: string,
  timeZone: string,
): string {
  let formatter = dateTimeFormatterByZone.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('ko-KR', {
      timeZone,
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
    dateTimeFormatterByZone.set(timeZone, formatter);
  }
  return formatter.format(new Date(instant));
}

export function formatInstantDateTimeRange(
  startAt: string,
  endAt: string,
  timeZone: string,
): string {
  const startDateKey = dateKeyInTimeZone(startAt, timeZone);
  const endDateKey = dateKeyInTimeZone(endAt, timeZone);
  const start = formatInstantDateTime(startAt, timeZone);
  const end =
    startDateKey === endDateKey
      ? formatInstantTime(endAt, timeZone)
      : formatInstantDateTime(endAt, timeZone);
  return `${start} – ${end}`;
}

export function formatDateKeyLabel(dateKey: string): string {
  const parts = parseDateKey(dateKey);
  return `${parts.month}월 ${parts.day}일 (${CALENDAR_WEEKDAYS_KO[weekdayIndex(dateKey)]})`;
}
