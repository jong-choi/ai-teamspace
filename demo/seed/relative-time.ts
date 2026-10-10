// 데모 데이터의 날짜는 모두 기준일에서 떨어진 거리로 적는다. 시각은 한국 시간이다.
export const DEMO_TIME_ZONE = 'Asia/Seoul';
const DEMO_UTC_OFFSET = '+09:00';
const DAY_MS = 24 * 60 * 60 * 1000;

export const demoWeekdays = [
  'mon',
  'tue',
  'wed',
  'thu',
  'fri',
  'sat',
  'sun',
] as const;

export type RelativeTime =
  // 달력 날짜 기준이다. 0이 기준일, -1이 어제다.
  | { day: number; time?: string }
  // 주말을 건너뛴 근무일 기준이다. 0은 기준일이 주말이면 다음 월요일이다.
  | { workday: number; time?: string }
  // 요일 기준이다. week 0이 기준일이 속한 주(월요일 시작)다.
  | { week: number; weekday: (typeof demoWeekdays)[number]; time?: string };

export function todayInSeoul(now: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: DEMO_TIME_ZONE }).format(
    now,
  );
}

export class DemoClock {
  private readonly baseDayMs: number;

  constructor(baseDate: string) {
    this.baseDayMs = Date.parse(`${baseDate}T00:00:00Z`);
    if (Number.isNaN(this.baseDayMs)) {
      throw new Error(`데모 기준일이 올바르지 않습니다: ${baseDate}`);
    }
  }

  resolve(relative: RelativeTime): Date {
    const dayMs = this.baseDayMs + this.dayOffset(relative) * DAY_MS;
    const date = new Date(dayMs).toISOString().slice(0, 10);
    return new Date(`${date}T${relative.time ?? '09:00'}:00${DEMO_UTC_OFFSET}`);
  }

  private dayOffset(relative: RelativeTime): number {
    if ('day' in relative) return relative.day;
    if ('weekday' in relative) {
      return (
        relative.week * 7 +
        demoWeekdays.indexOf(relative.weekday) -
        this.weekdayIndex(0)
      );
    }
    return this.workdayOffset(relative.workday);
  }

  // 월요일이 0, 일요일이 6이다.
  private weekdayIndex(offset: number): number {
    const day = new Date(this.baseDayMs + offset * DAY_MS).getUTCDay();
    return (day + 6) % 7;
  }

  private isWorkday(offset: number): boolean {
    return this.weekdayIndex(offset) < 5;
  }

  private workdayOffset(workday: number): number {
    const step = workday < 0 ? -1 : 1;
    let offset = 0;
    // 0 이상은 기준일부터, 음수는 전날부터 근무일을 센다.
    if (step > 0) {
      while (!this.isWorkday(offset)) offset += 1;
    }
    for (let remaining = Math.abs(workday); remaining > 0;) {
      offset += step;
      if (this.isWorkday(offset)) remaining -= 1;
    }
    return offset;
  }
}
