import { type ReactNode, useMemo } from 'react';
import * as WebBrowser from 'expo-web-browser';

import {
  type AgentChatPlatform,
  AgentChatPlatformProvider,
} from '@core/features/agent-chat/agent-chat-platform';
import { createAgentProtocolClient } from '@core/features/agent-chat/lib/agent-protocol-client';
import { createAgentRunMetadataStorage } from '@/lib/agent-run-metadata-storage.web';

export function ExpoAgentChatPlatformProvider({
  children,
}: {
  children: ReactNode;
}) {
  const value = useMemo<AgentChatPlatform>(
    () => ({
      client: createAgentProtocolClient(),
      createRunMetadataStorage: createAgentRunMetadataStorage,
      openAuthorization: async ({ authorizationUrl, redirectUrl }) => {
        const result = await WebBrowser.openAuthSessionAsync(
          authorizationUrl,
          redirectUrl,
        );
        if (result.type === 'success') return { type: 'success' };
        return {
          type: result.type === 'dismiss' ? 'dismiss' : 'cancel',
        };
      },
    }),
    [],
  );

  return (
    <AgentChatPlatformProvider value={value}>
      {children}
    </AgentChatPlatformProvider>
  );
}
