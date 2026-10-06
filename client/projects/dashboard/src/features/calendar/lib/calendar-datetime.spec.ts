import {
  addCalendarMonths,
  dateKeyInTimeZone,
  getCalendarQueryRange,
  getMonthGridDateKeys,
  getPeriodTitle,
  shiftCalendarPeriod,
  zonedDateTimeToIso,
} from '@core/features/calendar/lib/calendar-datetime';

import { describe, expect, test } from '@jest/globals';

describe('회의일정 datetime helper', () => {
  test('월간 grid는 이전/다음 달 trailing date를 포함한 7열 범위를 만든다', () => {
    const dates = getMonthGridDateKeys('2026-10-05');

    expect(dates).toHaveLength(35);
    expect(dates[0]).toBe('2026-09-27');
    expect(dates.at(-1)).toBe('2026-10-31');
  });

  test('월간 query range는 사용자 timezone의 visible grid 경계를 absolute instant로 변환한다', () => {
    const range = getCalendarQueryRange('month', '2026-10-05', 'Asia/Seoul');

    expect(range.from).toBe('2026-09-26T15:00:00.000Z');
    expect(range.to).toBe('2026-10-31T15:00:00.000Z');
    expect(range.title).toBe('2026년 10월');
  });

  test('IANA timezone 기준 local datetime을 instant로 변환한다', () => {
    expect(zonedDateTimeToIso('2026-10-05', '10:30', 'Asia/Seoul')).toBe(
      '2026-10-05T01:30:00.000Z',
    );
    expect(dateKeyInTimeZone('2026-10-04T16:00:00.000Z', 'Asia/Seoul')).toBe(
      '2026-10-05',
    );
  });

  test('DST spring-forward에 존재하지 않는 local time은 거부한다', () => {
    expect(() =>
      zonedDateTimeToIso('2026-03-08', '02:30', 'America/New_York'),
    ).toThrow('존재하지 않는 날짜 또는 시간');
  });

  test('잘못된 IANA timezone은 사용자에게 이해할 수 있는 오류로 거부한다', () => {
    expect(() =>
      zonedDateTimeToIso('2026-10-05', '10:30', 'Not/AZone'),
    ).toThrow('유효한 IANA timezone');
  });

  test('view별 이동 단위와 월 말 clamp가 안정적이다', () => {
    expect(shiftCalendarPeriod('2026-10-05', 'week', 1)).toBe('2026-10-12');
    expect(shiftCalendarPeriod('2026-10-05', 'day', -1)).toBe('2026-10-04');
    expect(addCalendarMonths('2026-01-31', 1)).toBe('2026-02-28');
  });

  test('연말을 가로지르는 주간 제목은 양쪽 연도를 보존한다', () => {
    expect(getPeriodTitle('week', '2027-01-01')).toBe(
      '2026년 12월 27일 – 2027년 1월 2일',
    );
  });
});
