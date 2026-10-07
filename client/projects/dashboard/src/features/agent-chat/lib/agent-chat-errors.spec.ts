import { mapAgentChatError } from '@core/features/agent-chat/lib/agent-chat-errors';

import { describe, expect, it } from '@jest/globals';

describe('Agent chat error mapping', () => {
  it('SDK transport의 status를 stable taxonomy로 변환한다', () => {
    expect(mapAgentChatError({ status: 401 }, 'run').kind).toBe(
      'unauthenticated',
    );
    expect(mapAgentChatError({ status: 404 }, 'thread').kind).toBe(
      'thread_not_found_or_forbidden',
    );
    expect(mapAgentChatError({ status: 409 }, 'run').kind).toBe('run_conflict');
  });

  it('SDK raw text JSON에서는 stable code만 읽고 raw message를 presentation에 노출하지 않는다', () => {
    const presentation = mapAgentChatError(
      {
        status: 500,
        text: JSON.stringify({
          code: 'mcp_unavailable',
          message: 'secret upstream hostname and credential detail',
        }),
      },
      'run',
    );

    expect(presentation.kind).toBe('mcp_unavailable');
    expect(JSON.stringify(presentation)).not.toContain('secret upstream');
  });

  it('알 수 없는 stream/cancel 오류는 operation별 fail-safe taxonomy로 떨어진다', () => {
    expect(mapAgentChatError(new Error('socket secret'), 'stream').kind).toBe(
      'stream_disconnected',
    );
    expect(mapAgentChatError(new Error('network secret'), 'cancel').kind).toBe(
      'cancel_unknown',
    );
  });

  it('알 수 없는 run 오류는 raw Error.message 대신 generic internal 문구를 사용한다', () => {
    const presentation = mapAgentChatError(
      new Error('provider raw secret detail'),
      'run',
    );

    expect(presentation.kind).toBe('internal');
    expect(JSON.stringify(presentation)).not.toContain('provider raw secret');
  });
});
