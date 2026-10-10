import { AgentChatProvider } from '@core/features/agent-chat/agent-chat-provider';
import { GraphStudioHeader } from '@core/features/knowledge-graph/components/graph-studio-header';

import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render } from '@testing-library/react-native';

describe('지식 그래프 상단 도구', () => {
  it('웹 그래프 검색은 공백을 정리해 route callback으로 보낸다', async () => {
    const onSearch = jest.fn();
    const view = await render(
      <AgentChatProvider>
        <GraphStudioHeader
          compact={false}
          onCreate={jest.fn()}
          onSearch={onSearch}
          onViewChange={jest.fn()}
          searchValue=""
          view="graph"
        />
      </AgentChatProvider>,
    );
    const search = view.getByLabelText('지식 그래프 검색');
    await fireEvent.changeText(search, '  neo4j  ');
    await fireEvent(search, 'submitEditing');
    expect(onSearch).toHaveBeenCalledWith('neo4j');
  });

  it('좁은 화면에서는 검색 input을 숨기고 보기 전환을 유지한다', async () => {
    const onViewChange = jest.fn();
    const view = await render(
      <AgentChatProvider>
        <GraphStudioHeader
          compact
          onCreate={jest.fn()}
          onSearch={jest.fn()}
          onViewChange={onViewChange}
          searchValue=""
          view="graph"
        />
      </AgentChatProvider>,
    );
    expect(view.queryByLabelText('지식 그래프 검색')).toBeNull();
    await fireEvent.press(view.getByText('데이터'));
    expect(onViewChange).toHaveBeenCalledWith('data');
  });
});
