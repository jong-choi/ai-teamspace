import {
  createAgentHitlResume,
  parseAgentHitlPresentation,
} from '@core/features/agent-chat/lib/agent-hitl';

import { describe, expect, it } from '@jest/globals';

describe('Agent HITL projection', () => {
  it('canonical LangChain HITL request를 safe presentation으로 변환한다', () => {
    const result = parseAgentHitlPresentation({
      actionRequests: [
        {
          name: 'send_message',
          args: {
            channel: 'general',
            token: 'must-not-render',
            nested: { raw: 'hidden' },
          },
          description: '메시지를 전송합니다.',
        },
      ],
      reviewConfigs: [
        {
          actionName: 'send_message',
          allowedDecisions: ['approve', 'reject'],
        },
      ],
    });

    expect(result).toEqual({
      actions: [
        {
          name: 'send_message',
          label: '외부 도구 작업',
          description: '메시지를 전송합니다.',
          arguments: [
            { key: 'channel', value: 'general' },
            { key: 'token', value: '••••' },
            { key: 'nested', value: '[복합 값]' },
          ],
          allowedDecisions: ['approve', 'reject'],
        },
      ],
      canApproveAll: true,
      canRejectAll: true,
    });
  });

  it('action/review pairing이 어긋나면 실행 가능한 UI로 만들지 않는다', () => {
    expect(
      parseAgentHitlPresentation({
        actionRequests: [{ name: 'write_a', args: {} }],
        reviewConfigs: [
          { actionName: 'write_b', allowedDecisions: ['approve'] },
        ],
      }),
    ).toBeNull();
  });

  it('모든 action에 공통 허용된 decision만 resume payload로 만든다', () => {
    const presentation = parseAgentHitlPresentation({
      actionRequests: [
        { name: 'write_a', args: {} },
        { name: 'write_b', args: {} },
      ],
      reviewConfigs: [
        { actionName: 'write_a', allowedDecisions: ['approve', 'reject'] },
        { actionName: 'write_b', allowedDecisions: ['approve'] },
      ],
    });

    expect(presentation).not.toBeNull();
    expect(createAgentHitlResume(presentation!, 'approve')).toEqual({
      decisions: [{ type: 'approve' }, { type: 'approve' }],
    });
    expect(() => createAgentHitlResume(presentation!, 'reject')).toThrow();
  });
});
