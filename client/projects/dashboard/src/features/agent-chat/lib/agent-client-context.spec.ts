import {
  buildAgentClientContext,
  stripAgentSystemContext,
} from '@core/features/agent-chat/lib/agent-client-context';

import { describe, expect, it } from '@jest/globals';

describe('buildAgentClientContext', () => {
  it('group segment를 뺀 route pattern과 값을 나눠 담는다', () => {
    const context = buildAgentClientContext({
      segments: ['(workspace)', 'projects', '[projectId]'],
      params: { projectId: 'p1', ticketId: ['t1', 't2'], view: undefined },
    });

    expect(context.route).toBe('/projects/[projectId]');
    expect(context.params).toEqual({ projectId: 'p1', ticketId: 't1' });
    expect(context.timeZone.length).toBeGreaterThan(0);
  });

  it('첫 화면은 루트 주소로 담는다', () => {
    expect(
      buildAgentClientContext({ segments: ['(workspace)'], params: {} }).route,
    ).toBe('/');
  });
});

describe('stripAgentSystemContext', () => {
  it('메시지 앞의 서버 블록만 뺀다', () => {
    expect(
      stripAgentSystemContext(
        '<system_context>\nuser: 김도윤 (id: u1)\n</system_context>\n\n내 티켓 보여줘',
      ),
    ).toBe('내 티켓 보여줘');
  });

  it('블록이 없거나 본문 중간에 있으면 그대로 둔다', () => {
    expect(stripAgentSystemContext('안녕')).toBe('안녕');
    const middle = '설명: <system_context>x</system_context> 이게 뭐야';
    expect(stripAgentSystemContext(middle)).toBe(middle);
  });
});
