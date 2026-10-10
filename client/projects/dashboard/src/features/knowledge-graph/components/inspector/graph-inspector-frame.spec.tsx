import { GraphInspectorTitle } from '@core/features/knowledge-graph/components/inspector/graph-inspector-frame';

import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

const mockCopyText = jest.fn(async () => undefined);
const mockNotifyError = jest.fn();
const mockNotifySuccess = jest.fn();

jest.mock('@core/app/platform/dashboard-platform', () => ({
  useDashboardPlatform: () => ({
    copyText: mockCopyText,
    notifyError: mockNotifyError,
    notifySuccess: mockNotifySuccess,
  }),
}));

describe('지식 그래프 인스펙터 제목', () => {
  it('긴 ID를 한 줄로 줄이고 복사 버튼으로 전체 값을 복사한다', async () => {
    const id = 'WzEsImUiLCJ3aWtpX2RvY3VtZW50Iiwi매우긴식별자';
    const view = await render(<GraphInspectorTitle id={id} title="귤밭" />);
    const idText = view.getByText(`ID: ${id}`);

    expect(idText.props.numberOfLines).toBe(1);
    expect(idText.props.ellipsizeMode).toBe('tail');
    await fireEvent.press(view.getByLabelText('귤밭 ID 복사'));

    await waitFor(() => expect(mockCopyText).toHaveBeenCalledWith(id));
    expect(mockNotifySuccess).toHaveBeenCalledWith({
      id: 'knowledge-graph-inspector-copy-id',
      title: 'ID를 복사했습니다',
    });
  });
});
