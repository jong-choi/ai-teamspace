import type { ReactNode } from 'react';

import { useDashboardPlatform } from '@core/app/platform/dashboard-platform';
import { useChatRealtime } from '@core/features/chat/use-chat-realtime';

type ChatRealtimeBoundaryProps = {
  children: ReactNode;
};

export function ChatRealtimeBoundary({ children }: ChatRealtimeBoundaryProps) {
  const { currentUserId, sessionPending } = useDashboardPlatform();

  useChatRealtime({
    currentUserId,
    enabled: !sessionPending && currentUserId !== null,
  });

  return children;
}
