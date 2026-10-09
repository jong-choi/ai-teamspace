import { groupAgentChatTurns } from '@core/features/agent-chat/lib/agent-chat-turns';
import { parseAgentHitlInterrupts } from '@core/features/agent-chat/lib/agent-hitl';
import greetingRun from '@core/features/agent-chat/lib/fixtures/greeting-run.json';
import ticketHitlRun from '@core/features/agent-chat/lib/fixtures/ticket-hitl-run.json';

import { describe, expect, it } from '@jest/globals';
import type { Message } from '@langchain/langgraph-sdk';
import {
  MessageTupleManager,
  toMessageDict,
} from '@langchain/langgraph-sdk/ui';
import { getToolCallsWithResults } from '@langchain/langgraph-sdk/utils';

/**
 * 실제 API 서버(`POST /threads/{id}/runs/stream`, stream mode `values`·`messages-tuple`)에서 받은
 * SSE 원문을 fixture의 `sse` 문자열에 그대로 담았다. 서버가 메시지를 LangGraph API 와이어 형식
 * (`{ type: "human" | "ai" | "tool", ... }`)으로 내려주는지, 그 형식이 SDK 처리를 거쳐 화면 turn으로
 * 만들어지는지를 함께 고정한다.
 * - greeting-run: 도구 없이 인사만 하는 짧은 실행. 추론(`reasoning_content`)과 답변이 있다.
 * - ticket-hitl-run: 컬럼 조회 뒤 티켓 생성을 승인 대기로 멈춘 실행.
 */
type SseEvent = { event: string; data: unknown };

/** SSE 원문을 `event`/`data` 쌍으로 나눈다. 각 frame의 `data`는 한 줄 JSON이다. */
function parseSse(raw: string): SseEvent[] {
  return raw
    .split('\n\n')
    .map((block) => {
      const lines = block.split('\n');
      const event = lines.find((line) => line.startsWith('event: '))?.slice(7);
      const data = lines.find((line) => line.startsWith('data: '))?.slice(6);
      return event && data
        ? { event, data: JSON.parse(data) as unknown }
        : null;
    })
    .filter((event): event is SseEvent => event !== null);
}

function valuesMessages(events: SseEvent[]): Message[] {
  const values = events
    .filter(({ event }) => event === 'values')
    .map(({ data }) => data as { messages?: Message[] })
    .filter((data) => Array.isArray(data.messages));
  return values.at(-1)?.messages ?? [];
}

describe('실제 Agent stream fixture 렌더링', () => {
  it('서버가 내려준 메시지는 constructor 형식 없이 human·ai·tool 와이어 형식이다', () => {
    for (const fixture of [greetingRun, ticketHitlRun]) {
      const events = parseSse(fixture.sse);
      expect(JSON.stringify(events)).not.toContain('"constructor"');
      expect(
        valuesMessages(events).every((message) =>
          ['human', 'ai', 'tool'].includes(message.type),
        ),
      ).toBe(true);
    }
  });

  it('최종 values로 사용자 메시지, 추론, 답변 turn을 만든다', () => {
    const messages = valuesMessages(parseSse(greetingRun.sse));

    const turns = groupAgentChatTurns({
      messages,
      toolCalls: getToolCallsWithResults(messages),
    });

    expect(turns.map((turn) => turn.kind)).toEqual(['user', 'assistant']);
    const [user, assistant] = turns;
    expect(user).toMatchObject({
      kind: 'user',
      text: '도구를 쓰지 말고 한 문장으로 인사만 해 줘.',
    });
    if (assistant?.kind !== 'assistant')
      throw new Error('assistant turn이 없습니다.');
    expect(assistant.reasoning).toBeTruthy();
    expect(assistant.items).toEqual([
      expect.objectContaining({ kind: 'text', text: '안녕하세요!' }),
    ]);
  });

  it('스트리밍 중 messages-tuple 청크만으로도 추론과 답변이 누적되어 보인다', () => {
    const events = parseSse(greetingRun.sse);
    const firstValues = events.find(({ event }) => event === 'values')
      ?.data as { messages: Message[] };

    // useStream과 같은 경로: SDK MessageTupleManager로 청크를 합치고 toMessageDict로 꺼낸다.
    const manager = new MessageTupleManager();
    const ids = new Set<string>();
    for (const { event, data } of events) {
      if (event !== 'messages') continue;
      const [chunk, metadata] = data as [
        Parameters<MessageTupleManager['add']>[0],
        Parameters<MessageTupleManager['add']>[1],
      ];
      const id = manager.add(chunk, metadata);
      if (id) ids.add(id);
    }
    const streamed = [...ids].flatMap((id) => {
      const chunk = manager.get(id)?.chunk;
      return chunk ? [toMessageDict(chunk) as Message] : [];
    });

    const turns = groupAgentChatTurns({
      messages: [...firstValues.messages, ...streamed],
      toolCalls: [],
    });

    const assistant = turns.at(-1);
    if (assistant?.kind !== 'assistant')
      throw new Error('assistant turn이 없습니다.');
    expect(assistant.reasoning).toBeTruthy();
    expect(assistant.items).toEqual([
      expect.objectContaining({ kind: 'text', text: '안녕하세요!' }),
    ]);
  });

  it('티켓 생성 실행은 도구 호출 turn과 승인 요청을 만든다', () => {
    const events = parseSse(ticketHitlRun.sse);
    const messages = valuesMessages(events);

    const turns = groupAgentChatTurns({
      messages,
      toolCalls: getToolCallsWithResults(messages),
    });

    const assistant = turns.at(-1);
    if (assistant?.kind !== 'assistant')
      throw new Error('assistant turn이 없습니다.');
    expect(
      assistant.items.map((item) =>
        item.kind === 'tool' ? [item.name, item.label, item.state] : item.kind,
      ),
    ).toEqual([
      ['project_columns_list', '업무 단계 확인', 'completed'],
      ['project_ticket_create', '업무 생성', 'pending'],
    ]);

    const interrupts = events
      .filter(({ event }) => event === 'values')
      .map(({ data }) => data as { __interrupt__?: { value: unknown }[] })
      .findLast((data) => data.__interrupt__)?.__interrupt__;
    const hitl = parseAgentHitlInterrupts(
      (interrupts ?? []).map(({ value }) => value),
    );
    expect(hitl?.actions.map(({ name }) => name)).toEqual([
      'project_ticket_create',
    ]);
    expect(events.at(-1)).toEqual({
      event: 'end',
      data: { status: 'interrupted' },
    });
  });
});
