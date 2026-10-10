import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { DemoClock } from '#seed/relative-time.ts';

const dateOf = (instant: Date) => instant.toISOString().slice(0, 10);

describe('DemoClock', () => {
  // 2026-10-10은 토요일이다.
  const saturday = new DemoClock('2026-10-10');
  // 2026-10-14는 수요일이다.
  const wednesday = new DemoClock('2026-10-14');

  it('달력 날짜는 한국 시간으로 해석한다', () => {
    assert.equal(
      wednesday.resolve({ day: 0, time: '10:00' }).toISOString(),
      '2026-10-14T01:00:00.000Z',
    );
    assert.equal(
      wednesday.resolve({ day: -1, time: '00:30' }).toISOString(),
      '2026-10-12T15:30:00.000Z',
    );
  });

  it('근무일은 주말을 건너뛴다', () => {
    assert.equal(dateOf(wednesday.resolve({ workday: 3 })), '2026-10-19');
    assert.equal(dateOf(wednesday.resolve({ workday: -3 })), '2026-10-09');
  });

  it('기준일이 주말이면 근무일 0은 다음 월요일이고 -1은 금요일이다', () => {
    assert.equal(dateOf(saturday.resolve({ workday: 0 })), '2026-10-12');
    assert.equal(dateOf(saturday.resolve({ workday: -1 })), '2026-10-09');
  });

  it('요일 지정은 기준일이 속한 주의 월요일부터 센다', () => {
    assert.equal(
      dateOf(wednesday.resolve({ week: 0, weekday: 'mon' })),
      '2026-10-12',
    );
    assert.equal(
      dateOf(saturday.resolve({ week: 1, weekday: 'fri' })),
      '2026-10-16',
    );
  });
});
