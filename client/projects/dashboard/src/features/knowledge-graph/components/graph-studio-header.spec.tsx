import { AgentChatProvider } from '@core/features/agent-chat/agent-chat-provider';
import { GraphStudioHeader } from '@core/features/knowledge-graph/components/graph-studio-header';

import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render } from '@testing-library/react-native';

describe('지식 그래프 상단 도구', () => {
  it('그래프와 데이터 센터 보기를 전환한다', async () => {
    const onViewChange = jest.fn();
    const view = await render(
      <AgentChatProvider>
        <GraphStudioHeader
          compact={false}
          onCreate={jest.fn()}
          onViewChange={onViewChange}
          view="graph"
        />
      </AgentChatProvider>,
    );
    await fireEvent.press(view.getByText('데이터 센터'));
    expect(onViewChange).toHaveBeenCalledWith('data');
  });

  it('좁은 화면에서는 짧은 데이터 보기 이름을 사용한다', async () => {
    const onViewChange = jest.fn();
    const view = await render(
      <AgentChatProvider>
        <GraphStudioHeader
          compact
          onCreate={jest.fn()}
          onViewChange={onViewChange}
          view="graph"
        />
      </AgentChatProvider>,
    );
    await fireEvent.press(view.getByText('데이터'));
    expect(onViewChange).toHaveBeenCalledWith('data');
  });
});
