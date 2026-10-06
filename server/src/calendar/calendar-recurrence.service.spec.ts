import { CalendarRecurrenceService } from '#server/calendar/calendar-recurrence.service.js';
import { CalendarInvalidRecurrenceError } from '#server/calendar/domain/calendar.error.js';

describe('캘린더 반복 일정 서비스', () => {
  const service = new CalendarRecurrenceService();

  test('timezone의 DST 변화 뒤에도 같은 현지 시각으로 weekly occurrence를 만든다', () => {
    const occurrences = service.materialize({
      startAt: new Date('2026-03-01T14:00:00.000Z'),
      endAt: new Date('2026-03-01T15:00:00.000Z'),
      rule: {
        frequency: 'weekly',
        interval: 1,
        count: 3,
        byWeekday: ['SU'],
        timeZone: 'America/New_York',
      },
    });

    expect(occurrences.map((item) => item.startAt.toISOString())).toEqual([
      '2026-03-01T14:00:00.000Z',
      '2026-03-08T13:00:00.000Z',
      '2026-03-15T13:00:00.000Z',
    ]);
  });

  test('첫 Meeting 시간이 recurrence rule에 포함되지 않으면 거부한다', () => {
    expect(() =>
      service.materialize({
        startAt: new Date('2026-03-02T14:00:00.000Z'),
        endAt: new Date('2026-03-02T15:00:00.000Z'),
        rule: {
          frequency: 'weekly',
          interval: 1,
          count: 3,
          byWeekday: ['TU'],
          timeZone: 'America/New_York',
        },
      }),
    ).toThrow(CalendarInvalidRecurrenceError);
  });

  test('반복 주기보다 회의 duration이 길어 occurrence끼리 겹치면 거부한다', () => {
    expect(() =>
      service.materialize({
        startAt: new Date('2026-10-06T00:00:00.000Z'),
        endAt: new Date('2026-10-08T00:00:00.000Z'),
        rule: {
          frequency: 'daily',
          interval: 1,
          count: 3,
          byWeekday: [],
          timeZone: 'Asia/Seoul',
        },
      }),
    ).toThrow(CalendarInvalidRecurrenceError);
  });
});
