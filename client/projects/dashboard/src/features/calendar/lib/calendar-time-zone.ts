import {
  parseDateKey,
  toDateKey,
} from '@core/features/calendar/lib/calendar-date-key';

type DateTimeParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

const timePattern = /^(\d{2}):(\d{2})$/;
const partsFormatterByZone = new Map<string, Intl.DateTimeFormat>();
const validatedTimeZones = new Set<string>();

export function getSystemTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

export function todayDateKey(timeZone: string, now = new Date()): string {
  return dateKeyInTimeZone(now.toISOString(), timeZone);
}

export function dateKeyInTimeZone(instant: string, timeZone: string): string {
  return toDateKey(instantParts(new Date(instant), timeZone));
}

export function minutesInDayForInstant(
  instant: string,
  timeZone: string,
): number {
  const parts = instantParts(new Date(instant), timeZone);
  return parts.hour * 60 + parts.minute + parts.second / 60;
}

export function durationMinutes(startAt: string, endAt: string): number {
  return (new Date(endAt).getTime() - new Date(startAt).getTime()) / 60_000;
}

export function calendarLocalScheduleToInstants(
  dateKey: string,
  startTime: string,
  endTime: string,
  timeZone: string,
): { startAt: string; endAt: string } {
  const startAt = zonedDateTimeToIso(dateKey, startTime, timeZone);
  const endAt = zonedDateTimeToIso(dateKey, endTime, timeZone);
  if (new Date(endAt).getTime() <= new Date(startAt).getTime()) {
    throw new Error('종료 시간은 시작 시간보다 늦어야 합니다.');
  }
  return { startAt, endAt };
}

export function zonedDateTimeToIso(
  dateKey: string,
  time: string,
  timeZone: string,
): string {
  assertIanaTimeZone(timeZone);
  const date = parseDateKey(dateKey);
  const timeMatch = timePattern.exec(time);
  if (!timeMatch) throw new Error('시간은 HH:mm 형식이어야 합니다.');
  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);
  if (hour > 23 || minute > 59) throw new Error('유효한 시간을 입력해 주세요.');

  const target: DateTimeParts = { ...date, hour, minute, second: 0 };
  const targetAsUtc = Date.UTC(
    target.year,
    target.month - 1,
    target.day,
    target.hour,
    target.minute,
    0,
    0,
  );
  let candidate = targetAsUtc;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const observed = instantParts(new Date(candidate), timeZone);
    const observedAsUtc = Date.UTC(
      observed.year,
      observed.month - 1,
      observed.day,
      observed.hour,
      observed.minute,
      observed.second,
      0,
    );
    const adjustment = targetAsUtc - observedAsUtc;
    candidate += adjustment;
    if (adjustment === 0) break;
  }

  const result = new Date(candidate);
  const resolved = instantParts(result, timeZone);
  if (
    resolved.year !== target.year ||
    resolved.month !== target.month ||
    resolved.day !== target.day ||
    resolved.hour !== target.hour ||
    resolved.minute !== target.minute
  ) {
    throw new Error('선택한 timezone에 존재하지 않는 날짜 또는 시간입니다.');
  }
  return result.toISOString();
}

function assertIanaTimeZone(timeZone: string): void {
  if (validatedTimeZones.has(timeZone)) return;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format(new Date(0));
    validatedTimeZones.add(timeZone);
  } catch {
    throw new Error('유효한 IANA timezone을 입력해 주세요.');
  }
}

function instantParts(date: Date, timeZone: string): DateTimeParts {
  let formatter = partsFormatterByZone.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });
    partsFormatterByZone.set(timeZone, formatter);
  }
  const values = new Map(
    formatter
      .formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, Number(part.value)]),
  );
  const year = values.get('year');
  const month = values.get('month');
  const day = values.get('day');
  const hour = values.get('hour');
  const minute = values.get('minute');
  const second = values.get('second');
  if (
    year === undefined ||
    month === undefined ||
    day === undefined ||
    hour === undefined ||
    minute === undefined ||
    second === undefined
  ) {
    throw new Error('timezone 날짜 정보를 계산할 수 없습니다.');
  }
  return { year, month, day, hour, minute, second };
}
