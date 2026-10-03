import { Dimensions, Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { DashboardShell } from '@core/app/shell/dashboard-shell';

import { fireEvent, render } from '@testing-library/react-native';

const insets = { bottom: 0, left: 0, right: 0, top: 0 };

function setWindowWidth(width: number) {
  const metrics = { fontScale: 1, height: 844, scale: 1, width };
  Dimensions.set({ screen: metrics, window: metrics });
}

function renderShell(width: number) {
  setWindowWidth(width);

  return render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { height: 844, width, x: 0, y: 0 },
        insets,
      }}
    >
      <DashboardShell>
        <Text>내용</Text>
      </DashboardShell>
    </SafeAreaProvider>,
  );
}

describe('대시보드 사이드바', () => {
  it('모바일에서 햄버거 버튼으로 메뉴를 열고 닫는다', async () => {
    const view = await renderShell(390);
    const menuButton = view.getByLabelText('메뉴 열기');

    expect(menuButton.props.accessibilityState).toEqual({ expanded: false });

    await fireEvent.press(menuButton);
    expect(view.getByLabelText('메뉴 열기').props.accessibilityState).toEqual({
      expanded: true,
    });

    await fireEvent.press(view.getByRole('button', { name: '메뉴 닫기' }));
    expect(view.getByLabelText('메뉴 열기').props.accessibilityState).toEqual({
      expanded: false,
    });
  });

  it('데스크톱 폭에서는 고정 사이드바를 표시한다', async () => {
    const view = await renderShell(1280);

    expect(view.queryByLabelText('메뉴 열기')).toBeNull();
    expect(view.getByText('Workspace')).toBeTruthy();
  });
});
