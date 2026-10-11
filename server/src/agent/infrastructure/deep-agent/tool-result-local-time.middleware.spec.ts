import { localizeInstants } from '@/agent/infrastructure/deep-agent/tool-result-local-time.middleware';

describe('localizeInstants', () => {
  it('UTC 시각을 사용자 time zone의 시각과 요일로 바꾼다', () => {
    expect(
      localizeInstants('{"startAt":"2026-10-21T05:00:00.000Z"}', 'Asia/Seoul'),
    ).toBe('{"startAt":"2026-10-21T14:00:00+09:00 (Wednesday)"}');
  });

  it('날짜가 넘어가면 요일도 사용자 time zone을 따른다', () => {
    expect(localizeInstants('2026-10-21T16:30:00Z', 'Asia/Seoul')).toBe(
      '2026-10-22T01:30:00+09:00 (Thursday)',
    );
  });

  it('UTC 시각이 아닌 글은 그대로 둔다', () => {
    const text = '마감 2026-10-21, 시작 2026-10-21T14:00:00+09:00';

    expect(localizeInstants(text, 'Asia/Seoul')).toBe(text);
  });
});
