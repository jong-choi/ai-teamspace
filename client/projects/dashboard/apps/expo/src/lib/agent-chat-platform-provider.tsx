import { type ReactNode, useMemo } from 'react';

import {
  type AgentChatPlatform,
  AgentChatPlatformProvider,
} from '@core/features/agent-chat/agent-chat-platform';
import { createAgentProtocolClient } from '@core/features/agent-chat/lib/agent-protocol-client';
import { createAgentRunMetadataStorage } from '@/lib/agent-run-metadata-storage.native';

export function ExpoAgentChatPlatformProvider({
  children,
}: {
  children: ReactNode;
}) {
  const value = useMemo<AgentChatPlatform>(
    () => ({
      client: createAgentProtocolClient(),
      createRunMetadataStorage: createAgentRunMetadataStorage,
    }),
    [],
  );

  return (
    <AgentChatPlatformProvider value={value}>
      {children}
    </AgentChatPlatformProvider>
  );
}
