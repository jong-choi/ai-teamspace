import { AgentAssistantTurn } from '@core/features/agent-chat/components/agent-assistant-turn';
import {
  AgentComposer,
  type AgentComposerReasoning,
} from '@core/features/agent-chat/components/agent-composer';
import { AgentHitlCard } from '@core/features/agent-chat/components/agent-hitl-card';
import { AgentThreadList } from '@core/features/agent-chat/components/agent-thread-list';
import { parseAgentHitlPresentation } from '@core/features/agent-chat/lib/agent-hitl';

import { describe, expect, it, jest } from '@jest/globals';
import type { Thread } from '@langchain/langgraph-sdk';
import { fireEvent, render } from '@testing-library/react-native';

jest.mock('@core/app/platform/dashboard-platform', () => ({
  useDashboardPlatform: () => ({
    copyText: jest.fn(async () => undefined),
    notifyError: jest.fn(),
    notifySuccess: jest.fn(),
  }),
}));

const reasoning: AgentComposerReasoning = {
  value: 'high',
  options: ['low', 'medium', 'high'],
  model: 'gpt-oss:120b',
  onChange: jest.fn(),
};

describe('Agent 컴포저', () => {
  it('전송 버튼으로 보내고 성공하면 draft를 비운다', async () => {
    const onSubmit = jest.fn(async () => true);
    const onChangeDraft = jest.fn();
    const view = await render(
      <AgentComposer
        draft="회의 잡아줘"
        onChangeDraft={onChangeDraft}
        onSubmit={onSubmit}
        reasoning={reasoning}
      />,
    );

    await fireEvent.press(view.getByLabelText('메시지 보내기'));
    expect(onSubmit).toHaveBeenCalledWith('회의 잡아줘');
    expect(onChangeDraft).toHaveBeenCalledWith('');
  });

  it('승인 대기 중에는 입력과 전송을 막고 이유를 보여 준다', async () => {
    const onSubmit = jest.fn(async () => true);
    const view = await render(
      <AgentComposer
        blockedReason="승인 대기 중인 작업이 있어 새 메시지를 보낼 수 없습니다."
        draft="다음 작업"
        onChangeDraft={jest.fn()}
        onSubmit={onSubmit}
        reasoning={reasoning}
      />,
    );

    expect(
      view.getByText(
        '승인 대기 중인 작업이 있어 새 메시지를 보낼 수 없습니다.',
      ),
    ).toBeTruthy();
    expect(view.getByLabelText('Agent에게 보낼 메시지').props.editable).toBe(
      false,
    );
    await fireEvent.press(view.getByLabelText('메시지 보내기'));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('실행 중에는 중지 버튼과 대기열 추가를 함께 제공한다', async () => {
    const onStop = jest.fn();
    const onSubmit = jest.fn(async () => true);
    const view = await render(
      <AgentComposer
        busy
        draft="이어서 할 일"
        onChangeDraft={jest.fn()}
        onStop={onStop}
        onSubmit={onSubmit}
        queue={[
          {
            id: 'q-1',
            threadId: 't',
            content: '대기 중 메시지',
            status: 'failed',
          },
        ]}
        reasoning={reasoning}
      />,
    );

    await fireEvent.press(view.getByLabelText('Agent 실행 중지'));
    expect(onStop).toHaveBeenCalled();
    await fireEvent.press(view.getByLabelText('대기열에 추가'));
    expect(onSubmit).toHaveBeenCalledWith('이어서 할 일');
    expect(view.getByText('전송 실패 · 대기 중 메시지')).toBeTruthy();
  });
});

describe('Agent HITL 카드', () => {
  const presentation = parseAgentHitlPresentation({
    actionRequests: [{ name: 'wiki_document_create', args: { title: '문서' } }],
    reviewConfigs: [
      {
        actionName: 'wiki_document_create',
        allowedDecisions: ['approve', 'edit', 'reject'],
      },
    ],
  })!;

  it('작업별 거절 사유를 resume payload로 전달한다', async () => {
    const onSubmit = jest.fn();
    const view = await render(
      <AgentHitlCard
        disabled={false}
        onSubmit={onSubmit}
        pending={false}
        presentation={presentation}
      />,
    );

    await fireEvent.press(view.getByLabelText('위키 문서 생성 거절'));
    await fireEvent.changeText(
      view.getByLabelText('위키 문서 생성 거절 사유'),
      '나중에',
    );
    await fireEvent.press(view.getByLabelText('결정 전달'));

    expect(onSubmit).toHaveBeenCalledWith({
      decisions: [
        { type: 'reject', message: expect.stringContaining('사유: 나중에') },
      ],
    });
  });

  it('수정 인자 JSON이 잘못되면 오류를 보여 주고 전달하지 않는다', async () => {
    const onSubmit = jest.fn();
    const view = await render(
      <AgentHitlCard
        disabled={false}
        onSubmit={onSubmit}
        pending={false}
        presentation={presentation}
      />,
    );

    await fireEvent.press(view.getByLabelText('위키 문서 생성 수정'));
    await fireEvent.changeText(
      view.getByLabelText('위키 문서 생성 수정 인자 JSON'),
      '{oops',
    );
    await fireEvent.press(view.getByLabelText('결정 전달'));

    expect(view.getByText('인자는 올바른 JSON이어야 합니다.')).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe('Agent assistant turn', () => {
  it('추론을 접어 두었다가 펼치고 도구 상태와 외부 출처를 표시한다', async () => {
    const view = await render(
      <AgentAssistantTurn
        running={false}
        turn={{
          kind: 'assistant',
          key: 'a',
          reasoning: '깊은 생각',
          createdAt: null,
          items: [
            {
              kind: 'tool',
              key: 'tool-1',
              id: '1',
              name: 'extgithub1__issue',
              label: '외부 도구 작업',
              source: { kind: 'external', namespace: 'extgithub1' },
              state: 'denied',
              fields: [],
              resultSummary: null,
              structured: undefined,
              subagent: null,
            },
            { kind: 'text', key: 'text-1', text: '**완료**했습니다' },
          ],
        }}
      />,
    );

    expect(view.getByText('extgithub1')).toBeTruthy();
    expect(view.getByText('권한 없음')).toBeTruthy();
    const trigger = view.getByLabelText('생각 펼치기');
    expect(trigger.props.accessibilityState).toMatchObject({ expanded: false });
    await fireEvent.press(trigger);
    expect(
      view.getByLabelText('생각 접기').props.accessibilityState,
    ).toMatchObject({
      expanded: true,
    });
    expect(view.getByText('완료')).toBeTruthy();
  });
});

describe('Agent thread 목록', () => {
  const threads: Thread[] = [
    {
      thread_id: 't-1',
      created_at: '2026-10-08T00:00:00Z',
      updated_at: '2026-10-08T01:00:00Z',
      state_updated_at: '2026-10-08T01:00:00Z',
      metadata: { title: '회의 정리' },
      status: 'interrupted',
      values: {},
      interrupts: {},
      config: {},
      error: null,
    },
  ];

  it('선택 상태와 입력 대기 상태를 표시하고 선택을 알린다', async () => {
    const onSelectThread = jest.fn();
    const view = await render(
      <AgentThreadList
        activeThreadId="t-1"
        onSelectThread={onSelectThread}
        threads={threads}
      />,
    );

    expect(view.getByText('입력 대기')).toBeTruthy();
    expect(
      view.getByLabelText('회의 정리').props.accessibilityState,
    ).toMatchObject({ selected: true });
    await fireEvent.press(view.getByLabelText('회의 정리'));
    expect(onSelectThread).toHaveBeenCalledWith('t-1', '회의 정리');
  });

  it('대화가 없으면 빈 상태를 보여 준다', async () => {
    const view = await render(
      <AgentThreadList
        activeThreadId={null}
        onSelectThread={jest.fn()}
        threads={[]}
      />,
    );
    expect(view.getByText('아직 Agent 대화가 없습니다.')).toBeTruthy();
  });
});
