import type { ReactNode } from 'react';

import { DashboardShell } from '@core/app/shell/dashboard-shell';
import { AgentChatProvider } from '@core/features/agent-chat/agent-chat-provider';

// 업무 route 공통 layout이다. 채팅 상태는 여기 한 번만 두어 페이지 이동에도 유지된다.
export function DashboardWorkspaceLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <AgentChatProvider>
      <DashboardShell>{children}</DashboardShell>
    </AgentChatProvider>
  );
}
