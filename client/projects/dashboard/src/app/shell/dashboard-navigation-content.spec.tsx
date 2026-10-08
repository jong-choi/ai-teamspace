import type { DashboardPlatformValue } from '@core/app/platform/dashboard-platform';
import { DashboardNavigationContent } from '@core/app/shell/dashboard-navigation-content';

import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render } from '@testing-library/react-native';

let mockSession: Pick<
  DashboardPlatformValue,
  'currentUser' | 'currentUserId' | 'sessionPending' | 'sessionError'
> = {
  currentUserId: 'user-1',
  currentUser: {
    id: 'user-1',
    name: '로그인 사용자',
    email: 'member@example.test',
    image: null,
  },
  sessionPending: false,
  sessionError: false,
};
const mockPush = jest.fn();
let mockOrganizationId: string | null = 'organization-a';
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('@repo/client/api-client', () => ({
  useOrganizationsControllerGetActiveSuspense: () => ({
    data: {
      activeOrganization: mockOrganizationId
        ? { organization: { id: mockOrganizationId, name: '테스트 조직' } }
        : null,
    },
  }),
}));
jest.mock('@core/app/platform/dashboard-platform', () => ({
  useDashboardPlatform: () => mockSession,
}));
jest.mock('@core/app/shell/theme-toggle', () => ({ ThemeToggle: () => null }));

describe('사이드바 실제 계정 표시', () => {
  it('현재 로그인 세션의 이름과 이메일을 표시한다', async () => {
    const view = await render(
      <DashboardNavigationContent organizationName="테스트 조직" />,
    );
    expect(view.getByText('로그인 사용자')).toBeTruthy();
    expect(view.getByText('member@example.test')).toBeTruthy();
    expect(view.queryByText('사용자 정보 연결 전')).toBeNull();
  });
  it('세션 확인 중과 조회 실패를 구분한다', async () => {
    mockSession = { ...mockSession, sessionPending: true };
    const view = await render(
      <DashboardNavigationContent organizationName="테스트 조직" />,
    );
    expect(view.getByText('계정 확인 중')).toBeTruthy();
    mockSession = { ...mockSession, sessionPending: false, sessionError: true };
    await view.rerender(
      <DashboardNavigationContent organizationName="테스트 조직" />,
    );
    expect(view.getByText('계정 확인 실패')).toBeTruthy();
    expect(view.queryByText('member@example.test')).toBeNull();
  });
  it('다른 계정으로 전환하거나 로그아웃하면 이전 사용자 정보를 남기지 않는다', async () => {
    mockSession = {
      currentUserId: 'user-2',
      currentUser: {
        id: 'user-2',
        name: '다른 사용자',
        email: 'second@example.test',
        image: null,
      },
      sessionPending: false,
      sessionError: false,
    };
    const view = await render(
      <DashboardNavigationContent organizationName="테스트 조직" />,
    );
    expect(view.getByText('second@example.test')).toBeTruthy();
    expect(view.queryByText('member@example.test')).toBeNull();
    mockSession = { ...mockSession, currentUserId: null, currentUser: null };
    await view.rerender(
      <DashboardNavigationContent organizationName="테스트 조직" />,
    );
    expect(view.getByText('로그인 필요')).toBeTruthy();
    expect(view.queryByText('second@example.test')).toBeNull();
  });
  it('멤버는 활성 조직 경로로 이동하고 채팅 진입점을 제공한다', async () => {
    mockSession = { ...mockSession, currentUserId: 'user-1' };
    mockPush.mockClear();
    mockOrganizationId = 'organization-b';
    const view = await render(
      <DashboardNavigationContent organizationName="테스트 조직" />,
    );
    await fireEvent.press(view.getByText('멤버'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/organizations/[organizationId]/members',
      params: { organizationId: 'organization-b' },
    });
    await fireEvent.press(view.getByText('채팅'));
    expect(mockPush).toHaveBeenCalledWith('/chat');
    expect(view.queryByText('홈')).toBeNull();
    expect(view.queryByText('팀')).toBeNull();
    expect(view.queryByText('업무')).toBeNull();
    expect(view.queryByText('AI 엔진')).toBeNull();
    expect(view.queryByText('상태 정보 연결 전')).toBeNull();
    expect(view.getAllByText('채팅')).toHaveLength(1);
  });
  it('활성 조직이 없으면 멤버 경로를 임의로 만들지 않는다', async () => {
    mockOrganizationId = null;
    mockPush.mockClear();
    const view = await render(
      <DashboardNavigationContent organizationName="테스트 조직" />,
    );
    await fireEvent.press(view.getByText('멤버'));
    expect(mockPush).not.toHaveBeenCalled();
  });
  it('AI는 페이지 이동 없이 채팅 패널을 여닫는 토글이다', async () => {
    mockPush.mockClear();
    const onToggleAgentChat = jest.fn();
    const view = await render(
      <DashboardNavigationContent
        agentChatOpen
        agentChatPendingApproval
        onToggleAgentChat={onToggleAgentChat}
        organizationName="테스트 조직"
      />,
    );
    const toggle = view.getByLabelText('AI, 승인 대기 중');
    expect(toggle.props.accessibilityState).toMatchObject({ expanded: true });
    await fireEvent.press(toggle);
    expect(onToggleAgentChat).toHaveBeenCalledTimes(1);
    expect(mockPush).not.toHaveBeenCalled();
  });
});
