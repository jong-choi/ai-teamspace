import {
  createDefaultRecurrenceDraft,
  recurrenceDraftToContract,
} from '@core/features/calendar/lib/calendar-recurrence';

import { describe, expect, test } from '@jest/globals';

describe('회의일정 반복 규칙 helper', () => {
  test('기본 draft는 주간 반복을 선택하되 반복 자체는 비활성이다', () => {
    const draft = createDefaultRecurrenceDraft();

    expect(draft.enabled).toBe(false);
    expect(draft.frequency).toBe('weekly');
    expect(recurrenceDraftToContract(draft, 'Asia/Seoul')).toBeUndefined();
  });

  test('횟수 기반 주간 반복은 generated contract 형태로 변환한다', () => {
    const result = recurrenceDraftToContract(
      {
        ...createDefaultRecurrenceDraft(),
        enabled: true,
        count: '6',
        byWeekday: ['MO', 'WE'],
      },
      'Asia/Seoul',
    );

    expect(result).toMatchObject({
      frequency: 'weekly',
      interval: 1,
      count: 6,
      byWeekday: ['MO', 'WE'],
      timeZone: 'Asia/Seoul',
    });
    expect(result?.until).toBeUndefined();
  });

  test('날짜 기반 반복은 회의 timezone의 해당 날짜 마지막 분을 instant로 변환한다', () => {
    const result = recurrenceDraftToContract(
      {
        ...createDefaultRecurrenceDraft(),
        enabled: true,
        endMode: 'until',
        untilDate: '2026-10-31',
      },
      'Asia/Seoul',
    );

    expect(result?.count).toBeUndefined();
    expect(result?.until).toBe('2026-10-31T14:59:00.000Z');
  });

  test('반복 종료 조건이 비어 있으면 서버 전송 전에 사용자 오류로 거부한다', () => {
    expect(() =>
      recurrenceDraftToContract(
        {
          ...createDefaultRecurrenceDraft(),
          enabled: true,
          count: '',
        },
        'Asia/Seoul',
      ),
    ).toThrow('반복 횟수를 입력');
  });

  test('첫 회의 요일을 제외한 주간 규칙은 서버 전송 전에 거부한다', () => {
    expect(() =>
      recurrenceDraftToContract(
        {
          ...createDefaultRecurrenceDraft(),
          enabled: true,
          byWeekday: ['TU'],
        },
        'Asia/Seoul',
        '2026-10-05',
      ),
    ).toThrow('첫 회의 날짜의 요일');
  });
});
