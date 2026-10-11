import type { AgentModelInfo } from '@repo/client/api-client/schemas';
import {
  AGENT_CHAT_NEW_THREAD_KEY,
  AGENT_CHAT_QUEUE_LIMIT,
  createAgentChatStore,
  resolveAgentReasoningEffort,
} from '@core/features/agent-chat/lib/agent-chat-store';

import { describe, expect, it } from '@jest/globals';

describe('Agent 채팅 store', () => {
  it('대화별 스크롤 위치를 유지하고 조직 전환 뒤 늦게 저장되는 이전 위치는 무시한다', () => {
    const store = createAgentChatStore();
    const chat = store.getState();
    chat.setOrganization('org-a');
    chat.rememberThreadScrollOffset('org-a', 't-1', 180);
    chat.rememberThreadScrollOffset('org-a', 't-2', 420);
    chat.newThread();
    expect(store.getState().threadScrollOffsets).toEqual({
      't-1': 180,
      't-2': 420,
    });
    chat.setOrganization('org-b');
    chat.rememberThreadScrollOffset('org-a', 't-1', 200);
    expect(store.getState().threadScrollOffsets).toEqual({});
  });

  it('닫기와 확대를 오가도 draft와 선택 thread를 유지한다', () => {
    const store = createAgentChatStore();
    const chat = store.getState();
    chat.setOrganization('org-a');
    chat.openPanel();
    chat.selectThread('t-1', '첫 대화');
    chat.setDraft('t-1', '작성 중');
    chat.setExpanded(true);
    chat.closePanel();
    chat.setExpanded(false);
    chat.togglePanel();

    expect(store.getState()).toMatchObject({
      open: true,
      everOpened: true,
      activeThreadId: 't-1',
      drafts: { 't-1': '작성 중' },
    });
  });

  it('thread별 draft와 새 대화 draft를 분리한다', () => {
    const store = createAgentChatStore();
    store.getState().setDraft(AGENT_CHAT_NEW_THREAD_KEY, '새 대화 초안');
    store.getState().setDraft('t-1', '기존 대화 초안');

    expect(store.getState().drafts).toEqual({
      [AGENT_CHAT_NEW_THREAD_KEY]: '새 대화 초안',
      't-1': '기존 대화 초안',
    });
  });

  it('새 대화 starter는 해당 thread에서 한 번만 소비된다', () => {
    const store = createAgentChatStore();
    store.getState().setDraft(AGENT_CHAT_NEW_THREAD_KEY, '회의 잡아줘');
    store.getState().startThread({
      threadId: 't-new',
      title: '회의 잡아줘',
      message: '회의 잡아줘',
    });
    expect(store.getState().pendingStarter).toEqual({
      threadId: 't-new',
      message: '회의 잡아줘',
    });
    expect(store.getState().drafts[AGENT_CHAT_NEW_THREAD_KEY]).toBeUndefined();

    store.getState().consumeStarter('t-other');
    expect(store.getState().pendingStarter).not.toBeNull();
    store.getState().consumeStarter('t-new');
    expect(store.getState().pendingStarter).toBeNull();
  });

  it('조직이 바뀌면 이전 조직의 대화, draft, 큐를 지운다', () => {
    const store = createAgentChatStore();
    const chat = store.getState();
    chat.setOrganization('org-a');
    chat.openPanel();
    chat.selectThread('t-1', '대화');
    chat.setDraft('t-1', '비밀 초안');
    chat.enqueue({ id: 'q-1', threadId: 't-1', content: '대기' });
    chat.setReasoningEffort('low');
    chat.setOrganization('org-b');

    expect(store.getState()).toMatchObject({
      organizationId: 'org-b',
      open: true,
      activeThreadId: null,
      drafts: {},
      queue: [],
      reasoningEffort: 'low',
    });
  });

  it('큐는 thread별 개수 제한을 지키고 실패 표시와 제거를 지원한다', () => {
    const store = createAgentChatStore();
    for (let index = 0; index <= AGENT_CHAT_QUEUE_LIMIT; index += 1) {
      store.getState().enqueue({
        id: `q-${index}`,
        threadId: 't-1',
        content: `메시지 ${index}`,
      });
    }
    expect(store.getState().queue).toHaveLength(AGENT_CHAT_QUEUE_LIMIT);

    store
      .getState()
      .failQueued({ id: 'q-0', threadId: 't-1', content: '메시지 0' });
    expect(
      store.getState().queue.find((entry) => entry.id === 'q-0')?.status,
    ).toBe('failed');

    store.getState().removeQueued('q-0');
    expect(store.getState().queue.map((entry) => entry.id)).not.toContain(
      'q-0',
    );
  });

  it('지원하지 않는 추론 수준은 모델 기본값으로 되돌린다', () => {
    const model: AgentModelInfo = {
      model: 'gpt-oss:120b',
      supportedReasoningEfforts: ['low', 'high'],
      defaultReasoningEffort: 'high',
    };

    expect(resolveAgentReasoningEffort(null, model)).toBe('high');
    expect(resolveAgentReasoningEffort('medium', model)).toBe('high');
    expect(resolveAgentReasoningEffort('low', model)).toBe('low');
  });
});
