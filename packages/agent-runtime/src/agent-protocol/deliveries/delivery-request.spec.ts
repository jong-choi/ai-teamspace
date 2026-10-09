import type { Delivery } from '@repo/agent-runtime/core';

import { AIMessage, HumanMessage } from '@langchain/core/messages';

import { toDeliveryRequest } from '#agent-runtime/agent-protocol/deliveries/delivery-request.js';

function deliveryWith(payload: unknown): Delivery {
  return {
    delivery_id: 'delivery-1',
    run_id: 'run-1',
    thread_id: 'thread-1',
    url: 'https://example.com/hook',
    payload,
    payload_truncated: false,
    run_status: 'success',
    status: 'delivering',
    attempt: 1,
    next_attempt_at: '2026-10-10T00:00:00.000Z',
    last_error: null,
    created_at: '2026-10-10T00:00:00.000Z',
    updated_at: '2026-10-10T00:00:00.000Z',
    expires_at: '2026-10-11T00:00:00.000Z',
  };
}

describe('webhook delivery 본문 직렬화', () => {
  test('values의 LangChain 메시지를 LangGraph API 와이어 형식으로 보낸다', () => {
    const request = toDeliveryRequest({
      delivery: deliveryWith({
        values: {
          messages: [
            new HumanMessage({ content: '안녕', id: 'human-1' }),
            new AIMessage({ content: '반갑습니다', id: 'ai-1' }),
          ],
        },
      }),
      attempt: 1,
      sentAt: new Date('2026-10-10T00:00:00.000Z'),
    });

    expect(request.attempt.body).not.toContain('"constructor"');
    const body = JSON.parse(request.attempt.body) as {
      values: { messages: { type: string; content: string; id: string }[] };
    };
    expect(
      body.values.messages.map(({ type, content, id }) => [type, content, id]),
    ).toEqual([
      ['human', '안녕', 'human-1'],
      ['ai', '반갑습니다', 'ai-1'],
    ]);
  });
});
