import { ScrollView, StyleSheet, Text } from 'react-native';

import {
  AgentChatProvider,
  useAgentChatStore,
} from '@core/features/agent-chat/agent-chat-provider';
import { AgentConversation } from '@core/features/agent-chat/components/agent-conversation';
import type { AgentChatTurn } from '@core/features/agent-chat/lib/agent-chat-turns';

import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render } from '@testing-library/react-native';

jest.mock('@core/features/agent-chat/components/agent-assistant-turn', () => ({
  AgentUserMessage: () => null,
  AgentTypingIndicator: () => null,
  AgentAssistantTurn: () => null,
}));

function question(key: string): AgentChatTurn {
  return { kind: 'user', key, text: key };
}

function answer(key: string, text: string): AgentChatTurn {
  return {
    kind: 'assistant',
    key,
    reasoning: null,
    items: [{ kind: 'text', key: `${key}-text`, text }],
    createdAt: null,
  };
}

function Chat({
  turns,
  running = false,
  hydrating = false,
  savedOffset,
}: {
  turns: readonly AgentChatTurn[];
  running?: boolean;
  hydrating?: boolean;
  savedOffset?: number;
}) {
  return (
    <AgentChatProvider
      initialState={{
        organizationId: 'org-1',
        threadScrollOffsets:
          savedOffset === undefined ? {} : { 'thread-1': savedOffset },
      }}
    >
      <AgentConversation
        hydrating={hydrating}
        organizationId="org-1"
        running={running}
        threadId="thread-1"
        turns={turns}
        footer={<Text>승인 안내</Text>}
      />
      <ScrollOffsetProbe />
    </AgentChatProvider>
  );
}

function ScrollOffsetProbe() {
  const offsets = useAgentChatStore((state) => state.threadScrollOffsets);
  return <Text testID="saved-scroll-offset">{JSON.stringify(offsets)}</Text>;
}

function layout(height: number, y = 0) {
  return { nativeEvent: { layout: { height, y, width: 320, x: 0 } } };
}

async function measure(
  view: Awaited<ReturnType<typeof render>>,
  key: string,
  contentHeight: number,
  turnHeight = 100,
  turnOffset = 420,
) {
  await fireEvent(view.getByLabelText('Agent 대화'), 'layout', layout(400));
  await fireEvent(
    view.getByTestId('agent-conversation-turns'),
    'layout',
    layout(contentHeight),
  );
  await fireEvent(
    view.getByTestId(`agent-turn-${key}`),
    'layout',
    layout(388, turnOffset),
  );
  await fireEvent(
    view.getByTestId(`agent-turn-content-${key}`),
    'layout',
    layout(turnHeight),
  );
  await fireEvent(
    view.getByLabelText('Agent 대화'),
    'contentSizeChange',
    320,
    contentHeight,
  );
}

describe('질문을 기준으로 유지하는 Agent 대화 스크롤', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  it('최신 질문에 화면 높이만큼 공간을 확보하고 충분한 레이아웃이 생기면 한 번 이동한다', async () => {
    const scrollTo = jest
      .spyOn(ScrollView.prototype, 'scrollTo')
      .mockImplementation(() => undefined);
    const view = await render(<Chat running turns={[question('q-1')]} />);
    await measure(view, 'q-1', 500);
    expect(
      StyleSheet.flatten(view.getByTestId('agent-turn-q-1').props.style)
        .minHeight,
    ).toBe(388);
    expect(scrollTo).not.toHaveBeenCalled();
    await fireEvent(
      view.getByLabelText('Agent 대화'),
      'contentSizeChange',
      320,
      1000,
    );
    expect(scrollTo).toHaveBeenCalledTimes(1);
    expect(scrollTo).toHaveBeenLastCalledWith({ y: 408, animated: false });
  });

  it('첫 응답과 스트리밍 및 도구 상세 확장에는 스크롤하지 않고 다음 질문에만 이동한다', async () => {
    const scrollTo = jest
      .spyOn(ScrollView.prototype, 'scrollTo')
      .mockImplementation(() => undefined);
    const view = await render(<Chat running turns={[question('q-1')]} />);
    await measure(view, 'q-1', 1000);
    await view.rerender(
      <Chat running turns={[question('q-1'), answer('a-1', '첫 응답')]} />,
    );
    await measure(view, 'q-1', 1200, 700);
    await view.rerender(
      <Chat
        turns={[question('q-1'), answer('a-1', '긴 응답과 펼친 도구 결과')]}
      />,
    );
    await measure(view, 'q-1', 1800, 1200);
    expect(scrollTo).toHaveBeenCalledTimes(1);
    expect(
      StyleSheet.flatten(view.getByTestId('agent-turn-q-1').props.style)
        .minHeight,
    ).toBe(388);
    await view.rerender(
      <Chat
        running
        turns={[question('q-1'), answer('a-1', '응답'), question('q-2')]}
      />,
    );
    await measure(view, 'q-2', 2000, 100, 1200);
    expect(scrollTo).toHaveBeenCalledTimes(2);
    expect(scrollTo).toHaveBeenLastCalledWith({ y: 1188, animated: true });
    expect(
      StyleSheet.flatten(view.getByTestId('agent-turn-q-1').props.style)
        ?.minHeight,
    ).toBeUndefined();
  });

  it('빈 하단 공간은 최신 이동 버튼을 만들지 않고 실제 응답이 화면 밖에 있을 때만 이동한다', async () => {
    const scrollTo = jest
      .spyOn(ScrollView.prototype, 'scrollTo')
      .mockImplementation(() => undefined);
    const view = await render(<Chat running turns={[question('q-1')]} />);
    await measure(view, 'q-1', 1600, 100);
    expect(view.queryByLabelText('최신 응답으로 이동')).toBeNull();
    await fireEvent(
      view.getByTestId('agent-turn-content-q-1'),
      'layout',
      layout(800),
    );
    expect(view.getByLabelText('최신 응답으로 이동')).toBeTruthy();
    await fireEvent.press(view.getByLabelText('최신 응답으로 이동'));
    expect(scrollTo).toHaveBeenLastCalledWith({ y: 836, animated: true });
    expect(view.queryByLabelText('최신 응답으로 이동')).toBeNull();
  });

  it('완료된 대화는 읽던 위치를 복원하고 진행 중인 대화는 최신 질문으로 이동한다', async () => {
    const scrollTo = jest
      .spyOn(ScrollView.prototype, 'scrollTo')
      .mockImplementation(() => undefined);
    const completed = await render(
      <Chat
        savedOffset={180}
        turns={[question('q-1'), answer('a-1', '완료')]}
      />,
    );
    await measure(completed, 'q-1', 1000);
    expect(scrollTo).toHaveBeenLastCalledWith({ y: 180, animated: false });
    await completed.unmount();
    const active = await render(
      <Chat
        running
        savedOffset={180}
        turns={[question('q-1'), answer('a-1', '생성 중')]}
      />,
    );
    await measure(active, 'q-1', 1000);
    expect(scrollTo).toHaveBeenLastCalledWith({ y: 408, animated: false });
  });

  it('직접 스크롤하거나 화면 크기가 바뀌어도 생성 중인 응답을 자동으로 따라가지 않는다', async () => {
    const scrollTo = jest
      .spyOn(ScrollView.prototype, 'scrollTo')
      .mockImplementation(() => undefined);
    const view = await render(<Chat running turns={[question('q-1')]} />);
    await measure(view, 'q-1', 1000);
    await fireEvent.scroll(view.getByLabelText('Agent 대화'), {
      nativeEvent: { contentOffset: { y: 120, x: 0 } },
    });
    await fireEvent(view.getByLabelText('Agent 대화'), 'layout', layout(600));
    await fireEvent(
      view.getByLabelText('Agent 대화'),
      'contentSizeChange',
      320,
      1800,
    );
    expect(scrollTo).toHaveBeenCalledTimes(1);
    expect(
      StyleSheet.flatten(view.getByTestId('agent-turn-q-1').props.style)
        .minHeight,
    ).toBe(588);
  });

  it('사용자가 읽던 위치를 스크롤 종료 시 저장하고 불러오기 중에는 기존 위치를 덮어쓰지 않는다', async () => {
    const loading = await render(
      <Chat hydrating savedOffset={180} turns={[]} />,
    );
    await fireEvent(loading.getByLabelText('Agent 대화'), 'scrollEndDrag');
    expect(loading.getByTestId('saved-scroll-offset').props.children).toBe(
      '{"thread-1":180}',
    );
    await loading.unmount();

    const view = await render(<Chat turns={[question('q-1')]} />);
    await measure(view, 'q-1', 1000);
    await fireEvent.scroll(view.getByLabelText('Agent 대화'), {
      nativeEvent: { contentOffset: { y: 240, x: 0 } },
    });
    await fireEvent(view.getByLabelText('Agent 대화'), 'scrollEndDrag');
    expect(view.getByTestId('saved-scroll-offset').props.children).toBe(
      '{"thread-1":240}',
    );
  });
});
