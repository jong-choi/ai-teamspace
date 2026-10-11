import { groupAgentChatTurns } from '@core/features/agent-chat/lib/agent-chat-turns';
import { AGENT_HITL_REJECT_PREFIX } from '@core/features/agent-chat/lib/agent-hitl';

import { describe, expect, it } from '@jest/globals';
import type { Message, ToolCallWithResult } from '@langchain/langgraph-sdk';

function aiWithTool(id: string, toolCallId: string, name: string): Message {
  return {
    type: 'ai',
    id,
    content: '',
    tool_calls: [{ id: toolCallId, name, args: { title: '주간 회의' } }],
  };
}

function toolResult(
  toolCallId: string,
  name: string,
  state: ToolCallWithResult['state'],
  content: string,
  artifact?: unknown,
): ToolCallWithResult {
  return {
    id: toolCallId,
    call: { id: toolCallId, name, args: {} },
    aiMessage: { type: 'ai', content: '' },
    index: 0,
    state,
    result: {
      type: 'tool',
      tool_call_id: toolCallId,
      content,
      status: state === 'error' ? 'error' : 'success',
      artifact,
    },
  };
}

describe('Agent 대화 turn 묶기', () => {
  it('human은 user turn, 이어지는 ai와 tool은 하나의 assistant turn이 된다', () => {
    const turns = groupAgentChatTurns({
      messages: [
        { type: 'human', id: 'h1', content: '회의 잡아줘' },
        aiWithTool('a1', 'call-1', 'calendar_meeting_create'),
        { type: 'tool', id: 't1', tool_call_id: 'call-1', content: '{}' },
        { type: 'ai', id: 'a2', content: '회의를 만들었습니다.' },
        { type: 'human', id: 'h2', content: '고마워' },
      ],
      toolCalls: [
        toolResult('call-1', 'calendar_meeting_create', 'completed', '{}'),
      ],
    });

    expect(turns.map((turn) => turn.kind)).toEqual([
      'user',
      'assistant',
      'user',
    ]);
    const assistant = turns[1];
    if (assistant?.kind !== 'assistant') throw new Error('assistant turn 없음');
    expect(assistant.items.map((item) => item.kind)).toEqual(['tool', 'text']);
    expect(assistant.items[0]).toMatchObject({
      label: '회의 생성',
      state: 'completed',
      source: { kind: 'teamspace' },
      fields: [{ label: '제목', value: '주간 회의' }],
    });
  });

  it('턴 안의 추론 텍스트를 순서대로 합친다', () => {
    const turns = groupAgentChatTurns({
      messages: [
        { type: 'human', content: '질문' },
        {
          type: 'ai',
          id: 'a1',
          content: '',
          additional_kwargs: { reasoning_content: '첫 번째 생각' },
          tool_calls: [{ id: 'c1', name: 'wiki_search', args: {} }],
        },
        {
          type: 'ai',
          id: 'a2',
          content: '답변',
          additional_kwargs: { reasoning_content: '두 번째 생각' },
        },
      ],
      toolCalls: [],
    });

    const assistant = turns[1];
    if (assistant?.kind !== 'assistant') throw new Error('assistant turn 없음');
    expect(assistant.reasoning).toBe('첫 번째 생각\n\n두 번째 생각');
    expect(assistant.items[0]).toMatchObject({
      kind: 'tool',
      state: 'pending',
    });
  });

  it('외부 MCP 도구는 namespace 출처로 구분하고 raw 이름을 라벨에 쓰지 않는다', () => {
    const turns = groupAgentChatTurns({
      messages: [aiWithTool('a1', 'c1', 'extgithub1__create_issue')],
      toolCalls: [],
    });

    const assistant = turns[0];
    if (assistant?.kind !== 'assistant') throw new Error('assistant turn 없음');
    expect(assistant.items[0]).toMatchObject({
      label: '외부 도구 작업',
      source: { kind: 'external', namespace: 'extgithub1' },
    });
  });

  it('도구 오류를 사용자 거절과 권한 거부와 일반 실패로 구분한다', () => {
    const turns = groupAgentChatTurns({
      messages: [
        {
          type: 'ai',
          id: 'a1',
          content: '',
          tool_calls: [
            { id: 'c1', name: 'wiki_document_create', args: {} },
            { id: 'c2', name: 'wiki_document_update', args: {} },
            { id: 'c3', name: 'project_ticket_move', args: {} },
          ],
        },
      ],
      toolCalls: [
        toolResult(
          'c1',
          'wiki_document_create',
          'error',
          `${AGENT_HITL_REJECT_PREFIX} 사유: 보류`,
        ),
        toolResult(
          'c2',
          'wiki_document_update',
          'error',
          'Forbidden: insufficient_scope',
        ),
        toolResult('c3', 'project_ticket_move', 'error', 'timeout'),
      ],
    });

    const assistant = turns[0];
    if (assistant?.kind !== 'assistant') throw new Error('assistant turn 없음');
    expect(
      assistant.items.map((item) => item.kind === 'tool' && item.state),
    ).toEqual(['rejected', 'denied', 'error']);
  });

  it('write 결과의 structured content에서 result만 요약하고 receipt를 보존한다', () => {
    const structured = {
      result: { id: 'w-1', title: '새 문서' },
      mutation: { kind: 'wiki_document', operation: 'created' },
    };
    const turns = groupAgentChatTurns({
      messages: [aiWithTool('a1', 'c1', 'wiki_document_create')],
      toolCalls: [
        toolResult('c1', 'wiki_document_create', 'completed', 'raw', [
          { type: 'mcp_structured_content', data: structured },
        ]),
      ],
    });

    const assistant = turns[0];
    if (assistant?.kind !== 'assistant') throw new Error('assistant turn 없음');
    expect(assistant.items[0]).toMatchObject({
      resultSummary: '제목: 새 문서',
      structured,
    });
  });

  it('빈 텍스트 메시지는 turn과 item을 만들지 않고 하위 Agent 요약을 붙인다', () => {
    const turns = groupAgentChatTurns({
      messages: [
        { type: 'human', content: '   ' },
        aiWithTool('a1', 'c1', 'task'),
      ],
      toolCalls: [],
      getSubagent: (id) =>
        id === 'c1'
          ? { name: 'researcher', status: 'running', toolCount: 2 }
          : undefined,
    });

    expect(turns).toHaveLength(1);
    const assistant = turns[0];
    if (assistant?.kind !== 'assistant') throw new Error('assistant turn 없음');
    expect(assistant.items).toHaveLength(1);
    expect(assistant.items[0]).toMatchObject({
      label: '하위 Agent 위임',
      source: { kind: 'agent' },
      subagent: { name: 'researcher', status: 'running', toolCount: 2 },
    });
  });
});
