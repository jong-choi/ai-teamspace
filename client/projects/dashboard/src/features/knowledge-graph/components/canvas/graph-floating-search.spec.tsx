import { GraphFloatingSearch } from '@core/features/knowledge-graph/components/canvas/graph-floating-search';

import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render } from '@testing-library/react-native';

describe('지식 그래프 플로팅 검색', () => {
  it('검색어의 양쪽 공백을 제거해 제출한다', async () => {
    const onSearch = jest.fn();
    const view = await render(
      <GraphFloatingSearch onSearch={onSearch} value="" />,
    );
    const input = view.getByLabelText('지식 그래프 검색');
    await fireEvent.changeText(input, '  귤밭  ');
    await fireEvent(input, 'submitEditing');
    expect(onSearch).toHaveBeenCalledWith('귤밭');
  });

  it('검색어를 지우면 전체 그래프로 돌아간다', async () => {
    const onSearch = jest.fn();
    const view = await render(
      <GraphFloatingSearch onSearch={onSearch} value="결제" />,
    );
    await fireEvent.press(view.getByLabelText('지식 그래프 검색어 지우기'));
    expect(onSearch).toHaveBeenCalledWith('');
    expect(view.getByLabelText('지식 그래프 검색').props.value).toBe('');
  });
});
