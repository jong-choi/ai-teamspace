import { renderAgentSystemContext } from '@/agent/domain/agent-system-context';
import {
  findConversationTimeZone,
  localizeInstants,
} from '@/agent/infrastructure/deep-agent/tool-result-local-time.middleware';

import { AIMessage, HumanMessage } from '@langchain/core/messages';

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

describe('findConversationTimeZone', () => {
  const context = renderAgentSystemContext({
    user: { id: 'user-a' },
    organization: { id: 'org-a' },
    client: { timeZone: 'Asia/Seoul' },
    now: new Date('2026-10-11T00:00:00.000Z'),
  });

  it('사용자 메시지의 맥락 블록에서 time zone을 읽는다', () => {
    expect(
      findConversationTimeZone([
        new HumanMessage(`${context}\n\n회의 잡아 줘`),
        new AIMessage('네'),
      ]),
    ).toBe('Asia/Seoul');
  });

  it('맥락 블록이 없으면 찾지 못한다', () => {
    expect(
      findConversationTimeZone([new HumanMessage('time_zone: Asia/Seoul')]),
    ).toBeUndefined();
  });
});
