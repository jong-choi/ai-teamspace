import {
  parseTicketDueDateInput,
  toTicketDueDateInput,
} from '@core/features/projects/lib/ticket-detail-form';

import { describe, expect, it } from '@jest/globals';

describe('이슈 상세 날짜 입력', () => {
  it('서버 datetime을 날짜 입력 문자열로 축약한다', () => {
    expect(toTicketDueDateInput('2026-10-06T12:00:00.000Z')).toBe('2026-10-06');
    expect(toTicketDueDateInput(null)).toBe('');
  });

  it('정상 날짜는 canonical datetime으로 변환하고 빈 값은 null로 만든다', () => {
    expect(parseTicketDueDateInput('2026-10-06')).toBe(
      '2026-10-06T00:00:00.000Z',
    );
    expect(parseTicketDueDateInput('   ')).toBeNull();
  });

  it('존재하지 않는 날짜와 형식 오류를 거부한다', () => {
    expect(parseTicketDueDateInput('2026-02-31')).toBeUndefined();
    expect(parseTicketDueDateInput('2026-2-3')).toBeUndefined();
    expect(parseTicketDueDateInput('날짜 없음')).toBeUndefined();
  });
});
