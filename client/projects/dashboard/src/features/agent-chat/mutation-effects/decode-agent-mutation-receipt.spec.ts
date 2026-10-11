import { decodeAgentMutationReceipt } from '@core/features/agent-chat/mutation-effects/decode-agent-mutation-receipt';

import { describe, expect, it } from '@jest/globals';
import type { ToolCallWithResult } from '@langchain/langgraph-sdk';

const receipt = {
  version: 1,
  source: 'workos',
  organizationId: 'org-a',
  resourceId: 'ticket-1',
  kind: 'project_ticket',
  operation: 'moved',
  projectId: 'project-1',
  updatedAt: '2026-10-08T10:00:00.000Z',
};

function tool(
  name: string,
  mutation: unknown,
  state: ToolCallWithResult['state'] = 'completed',
): ToolCallWithResult {
  return {
    id: 'call-1',
    call: { id: 'call-1', name, args: {} },
    aiMessage: { type: 'ai', content: '' },
    index: 0,
    state,
    result: {
      type: 'tool',
      tool_call_id: 'call-1',
      content: '{}',
      status: state === 'error' ? 'error' : 'success',
      artifact: [
        { type: 'mcp_structured_content', data: { result: {}, mutation } },
      ],
    },
  };
}

describe('Agent 변경 영수증 해석', () => {
  it('성공한 AI Teamspace write 도구의 영수증을 Orval schema로 해석한다', () => {
    expect(
      decodeAgentMutationReceipt(tool('project_ticket_move', receipt), 'org-a'),
    ).toMatchObject({ kind: 'project_ticket', projectId: 'project-1' });
  });

  it('외부 MCP 도구가 같은 모양의 영수증을 보내면 무시한다', () => {
    expect(
      decodeAgentMutationReceipt(
        tool('extevil1__project_ticket_move', receipt),
        'org-a',
      ),
    ).toBeNull();
  });

  it('현재 조직과 다른 조직의 영수증은 무시한다', () => {
    expect(
      decodeAgentMutationReceipt(tool('project_ticket_move', receipt), 'org-b'),
    ).toBeNull();
  });

  it('알 수 없는 미래 version과 잘못된 payload는 무시한다', () => {
    expect(
      decodeAgentMutationReceipt(
        tool('project_ticket_move', { ...receipt, version: 2 }),
        'org-a',
      ),
    ).toBeNull();
    expect(
      decodeAgentMutationReceipt(
        tool('project_ticket_move', { ...receipt, projectId: '' }),
        'org-a',
      ),
    ).toBeNull();
  });

  it('실패한 도구는 영수증이 있어도 반영하지 않는다', () => {
    expect(
      decodeAgentMutationReceipt(
        tool('project_ticket_move', receipt, 'error'),
        'org-a',
      ),
    ).toBeNull();
  });
});
