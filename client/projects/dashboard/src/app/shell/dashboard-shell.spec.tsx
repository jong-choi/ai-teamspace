import { Text } from 'react-native';

import { DashboardShell } from '@core/app/shell/dashboard-shell';
import { AgentChatProvider } from '@core/features/agent-chat/agent-chat-provider';
import { AgentChatHeader } from '@core/features/agent-chat/components/agent-chat-header';

import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render } from '@testing-library/react-native';

let mockWide = false;
const mockBodyMounts = jest.fn();
const mockNavigationContent = jest.fn();

jest.mock('expo-router', () => ({
  usePathname: () => '/projects',
  useRouter: () => ({ push: jest.fn() }),
}));
jest.mock('@core/features/agent-chat/lib/use-agent-chat-layout', () => ({
  useAgentChatWideLayout: () => mockWide,
}));
jest.mock('@core/features/agent-chat/agent-chat-panel', () => ({
  AgentChatPanel: () => null,
}));
jest.mock('@core/app/shell/dashboard-navigation-content', () => ({
  DashboardNavigationContent: (props: unknown) => {
    mockNavigationContent(props);
    return null;
  },
}));
jest.mock('@core/app/shell/dashboard-account-avatar', () => ({
  DashboardAccountAvatar: () => null,
}));
jest.mock('@core/app/shell/dashboard-organization-label', () => ({
  DashboardOrganizationLabel: () => null,
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('@core/app/shell/theme-toggle', () => ({ ThemeToggle: () => null }));

function Body() {
  mockBodyMounts();
  return <Text>업무 본문</Text>;
}

describe('업무 shell의 Agent 채팅 토글', () => {
  it('모바일 헤더 토글로 열고 닫아도 업무 본문을 다시 mount하지 않는다', async () => {
    mockWide = false;
    mockBodyMounts.mockClear();
    const view = await render(
      <AgentChatProvider>
        <DashboardShell>
          <Body />
        </DashboardShell>
      </AgentChatProvider>,
    );

    const toggle = view.getByLabelText('Agent 채팅 열기');
    await fireEvent.press(toggle);
    expect(
      view.getByLabelText('Agent 채팅 닫기').props.accessibilityState,
    ).toMatchObject({ expanded: true });
    await fireEvent.press(view.getByLabelText('Agent 채팅 닫기'));

    expect(view.getByText('업무 본문')).toBeTruthy();
    expect(mockBodyMounts.mock.calls.length).toBeLessThanOrEqual(3);
  });

  it('승인 대기가 있으면 패널이 닫혀 있어도 헤더에 배지를 표시한다', async () => {
    const view = await render(
      <AgentChatProvider initialState={{ pendingApproval: true }}>
        <DashboardShell>
          <Body />
        </DashboardShell>
      </AgentChatProvider>,
    );
    expect(view.getByLabelText('Agent 채팅 열기, 승인 대기 중')).toBeTruthy();
  });
});

describe('데스크톱 사이드바와 모바일 메뉴 상태', () => {
  it('데스크톱은 펼쳐서 시작하고 아이콘 레일로 접었다가 다시 펼친다', async () => {
    mockWide = true;
    mockNavigationContent.mockClear();
    const view = await render(
      <AgentChatProvider>
        <DashboardShell>
          <Body />
        </DashboardShell>
      </AgentChatProvider>,
    );
    expect(
      view.getByLabelText('사이드바 닫기').props.accessibilityState.expanded,
    ).toBe(true);
    await fireEvent.press(view.getByLabelText('사이드바 닫기'));
    expect(
      view.getByLabelText('사이드바 열기').props.accessibilityState.expanded,
    ).toBe(false);
    expect(mockNavigationContent).toHaveBeenLastCalledWith(
      expect.objectContaining({ collapsed: true }),
    );
    await fireEvent.press(view.getByLabelText('사이드바 열기'));
    expect(mockNavigationContent).toHaveBeenLastCalledWith(
      expect.objectContaining({ collapsed: false }),
    );
  });

  it('접힌 데스크톱에서 모바일로 바뀌어도 모바일 메뉴는 닫힌 전체 메뉴로 시작한다', async () => {
    mockWide = true;
    const view = await render(
      <AgentChatProvider>
        <DashboardShell>
          <Body />
        </DashboardShell>
      </AgentChatProvider>,
    );
    await fireEvent.press(view.getByLabelText('사이드바 닫기'));
    mockWide = false;
    await view.rerender(
      <AgentChatProvider>
        <DashboardShell>
          <Body />
        </DashboardShell>
      </AgentChatProvider>,
    );
    expect(view.queryByLabelText('사이드바 열기')).toBeNull();
    expect(view.queryByLabelText('사이드바 닫기')).toBeNull();
    expect(
      view.getByLabelText('메뉴 열기').props.accessibilityState.expanded,
    ).toBe(false);
    expect(mockNavigationContent).toHaveBeenLastCalledWith(
      expect.objectContaining({ collapsed: false }),
    );
    await fireEvent.press(view.getByLabelText('메뉴 열기'));
    expect(
      view.getByLabelText('메뉴 열기').props.accessibilityState.expanded,
    ).toBe(true);
    expect(mockNavigationContent).toHaveBeenLastCalledWith(
      expect.objectContaining({ collapsed: false }),
    );
    mockWide = true;
    await view.rerender(
      <AgentChatProvider>
        <DashboardShell>
          <Body />
        </DashboardShell>
      </AgentChatProvider>,
    );
    expect(view.getByLabelText('사이드바 열기')).toBeTruthy();
    expect(mockNavigationContent).toHaveBeenLastCalledWith(
      expect.objectContaining({ collapsed: true }),
    );
  });

  it('모바일 메뉴를 열어도 데스크톱 기본 펼침 상태는 바뀌지 않는다', async () => {
    mockWide = false;
    const view = await render(
      <AgentChatProvider>
        <DashboardShell>
          <Body />
        </DashboardShell>
      </AgentChatProvider>,
    );
    expect(
      view.getByLabelText('메뉴 열기').props.accessibilityState.expanded,
    ).toBe(false);
    await fireEvent.press(view.getByLabelText('메뉴 열기'));
    mockWide = true;
    await view.rerender(
      <AgentChatProvider>
        <DashboardShell>
          <Body />
        </DashboardShell>
      </AgentChatProvider>,
    );
    expect(view.getByLabelText('사이드바 닫기')).toBeTruthy();
    expect(mockNavigationContent).toHaveBeenLastCalledWith(
      expect.objectContaining({ collapsed: false }),
    );
  });
});

describe('Agent 채팅 헤더', () => {
  const handlers = {
    onClose: jest.fn(),
    onNewThread: jest.fn(),
    onToggleExpand: jest.fn(),
    onToggleList: jest.fn(),
  };

  it('확대 버튼은 넓은 화면에서만 보인다', async () => {
    const narrow = await render(
      <AgentChatHeader
        {...handlers}
        expanded={false}
        listOpen={false}
        showExpand={false}
        showListToggle
        title="대화"
      />,
    );
    expect(narrow.queryByLabelText('채팅 확대')).toBeNull();

    const wide = await render(
      <AgentChatHeader
        {...handlers}
        expanded
        listOpen={false}
        showExpand
        showListToggle={false}
        title="대화"
      />,
    );
    await fireEvent.press(wide.getByLabelText('채팅 축소'));
    expect(handlers.onToggleExpand).toHaveBeenCalled();
    expect(wide.queryByLabelText('대화 목록')).toBeNull();
  });
});
