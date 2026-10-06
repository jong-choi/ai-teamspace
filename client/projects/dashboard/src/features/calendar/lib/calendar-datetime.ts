export type CalendarViewMode = 'month' | 'week' | 'day' | 'list';

export type CalendarQueryRange = {
  from: string;
  to: string;
  title: string;
};

type DateParts = {
  year: number;
  month: number;
  day: number;
};

type DateTimeParts = DateParts & {
  hour: number;
  minute: number;
  second: number;
};

const dateKeyPattern = /^(\d{4})-(\d{2})-(\d{2})$/;
const timePattern = /^(\d{2}):(\d{2})$/;

export const CALENDAR_WEEKDAYS_KO = [
  '일',
  '월',
  '화',
  '수',
  '목',
  '금',
  '토',
] as const;

export function getSystemTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

export function todayDateKey(timeZone: string, now = new Date()): string {
  return dateKeyInTimeZone(now.toISOString(), timeZone);
}

export function dateKeyInTimeZone(instant: string, timeZone: string): string {
  const parts = instantParts(new Date(instant), timeZone);
  return toDateKey(parts);
}

export function formatInstantTime(instant: string, timeZone: string): string {
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(instant));
}

export function formatInstantDateTime(
  instant: string,
  timeZone: string,
): string {
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone,
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(instant));
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
    if (!first || !last)
      throw new Error('월간 캘린더 범위를 계산할 수 없습니다.');
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

export function getMonthGridDateKeys(currentDateKey: string): string[] {
  const current = parseDateKey(currentDateKey);
  const first = toDateKeyFromParts({
    year: current.year,
    month: current.month,
    day: 1,
  });
  const firstDayOfWeek = weekdayIndex(first);
  const start = addCalendarDays(first, -firstDayOfWeek);
  const lastDay = daysInMonth(current.year, current.month);
  const minimumCells = firstDayOfWeek + lastDay;
  const cellCount = Math.ceil(minimumCells / 7) * 7;
  return Array.from({ length: cellCount }, (_, index) =>
    addCalendarDays(start, index),
  );
}

export function getWeekDateKeys(currentDateKey: string): string[] {
  const start = startOfWeekDateKey(currentDateKey);
  return Array.from({ length: 7 }, (_, index) => addCalendarDays(start, index));
}

export function getMiniCalendarDateKeys(currentDateKey: string): string[] {
  return getMonthGridDateKeys(currentDateKey);
}

export function isDateKeyInSameMonth(
  dateKey: string,
  referenceDateKey: string,
): boolean {
  const date = parseDateKey(dateKey);
  const reference = parseDateKey(referenceDateKey);
  return date.year === reference.year && date.month === reference.month;
}

export function weekdayIndex(dateKey: string): number {
  const { year, month, day } = parseDateKey(dateKey);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

export function dayOfMonth(dateKey: string): number {
  return parseDateKey(dateKey).day;
}

export function formatDateKeyLabel(dateKey: string): string {
  const parts = parseDateKey(dateKey);
  return `${parts.month}월 ${parts.day}일 (${CALENDAR_WEEKDAYS_KO[weekdayIndex(dateKey)]})`;
}

export function addCalendarDays(dateKey: string, amount: number): string {
  const date = utcDateFromKey(dateKey);
  date.setUTCDate(date.getUTCDate() + amount);
  return toDateKeyFromUtcDate(date);
}

export function addCalendarMonths(dateKey: string, amount: number): string {
  const parts = parseDateKey(dateKey);
  const targetFirst = new Date(
    Date.UTC(parts.year, parts.month - 1 + amount, 1),
  );
  const targetYear = targetFirst.getUTCFullYear();
  const targetMonth = targetFirst.getUTCMonth() + 1;
  const targetDay = Math.min(parts.day, daysInMonth(targetYear, targetMonth));
  return toDateKeyFromParts({
    year: targetYear,
    month: targetMonth,
    day: targetDay,
  });
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

function startOfWeekDateKey(dateKey: string): string {
  return addCalendarDays(dateKey, -weekdayIndex(dateKey));
}

function parseDateKey(dateKey: string): DateParts {
  const match = dateKeyPattern.exec(dateKey);
  if (!match) throw new Error('날짜는 YYYY-MM-DD 형식이어야 합니다.');
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() + 1 !== month ||
    date.getUTCDate() !== day
  ) {
    throw new Error('유효한 날짜를 입력해 주세요.');
  }
  return { year, month, day };
}

function utcDateFromKey(dateKey: string): Date {
  const { year, month, day } = parseDateKey(dateKey);
  return new Date(Date.UTC(year, month - 1, day));
}

function toDateKey(parts: DateParts): string {
  return `${String(parts.year).padStart(4, '0')}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}

function toDateKeyFromParts(parts: DateParts): string {
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  return toDateKeyFromUtcDate(date);
}

function toDateKeyFromUtcDate(date: Date): string {
  return toDateKey({
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  });
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function assertIanaTimeZone(timeZone: string): void {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format(new Date(0));
  } catch {
    throw new Error('유효한 IANA timezone을 입력해 주세요.');
  }
}

function instantParts(date: Date, timeZone: string): DateTimeParts {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
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
