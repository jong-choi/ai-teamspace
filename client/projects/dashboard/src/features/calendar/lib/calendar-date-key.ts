export type DateParts = {
  year: number;
  month: number;
  day: number;
};

const dateKeyPattern = /^(\d{4})-(\d{2})-(\d{2})$/;

export const CALENDAR_WEEKDAYS_KO = [
  '일',
  '월',
  '화',
  '수',
  '목',
  '금',
  '토',
] as const;

export function parseDateKey(dateKey: string): DateParts {
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

export function startOfWeekDateKey(dateKey: string): string {
  return addCalendarDays(dateKey, -weekdayIndex(dateKey));
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

export function toDateKey(parts: DateParts): string {
  return `${String(parts.year).padStart(4, '0')}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}

export function toDateKeyFromParts(parts: DateParts): string {
  return toDateKeyFromUtcDate(
    new Date(Date.UTC(parts.year, parts.month - 1, parts.day)),
  );
}

function utcDateFromKey(dateKey: string): Date {
  const { year, month, day } = parseDateKey(dateKey);
  return new Date(Date.UTC(year, month - 1, day));
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
