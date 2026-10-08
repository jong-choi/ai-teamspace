import { createContext, type ReactNode, useContext } from 'react';

import type { Client } from '@langchain/langgraph-sdk';

export type AgentRunMetadataStorage = {
  getItem(key: `lg:stream:${string}`): string | null;
  setItem(key: `lg:stream:${string}`, value: string): void;
  removeItem(key: `lg:stream:${string}`): void;
};

export type AgentRunMetadataNamespace = {
  userId: string;
  organizationId: string;
};

export type AgentChatPlatform = {
  client: Client;
  createRunMetadataStorage(
    namespace: AgentRunMetadataNamespace,
  ): AgentRunMetadataStorage;
};

const AgentChatPlatformContext = createContext<AgentChatPlatform | null>(null);

export function AgentChatPlatformProvider({
  children,
  value,
}: {
  children: ReactNode;
  value: AgentChatPlatform;
}) {
  return (
    <AgentChatPlatformContext.Provider value={value}>
      {children}
    </AgentChatPlatformContext.Provider>
  );
}

export function useAgentChatPlatform(): AgentChatPlatform {
  const value = useContext(AgentChatPlatformContext);
  if (!value) {
    throw new Error('Agent Chat 플랫폼 어댑터가 연결되지 않았습니다.');
  }
  return value;
}
