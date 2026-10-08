import { createContext, type ReactNode, useContext, useState } from 'react';

import {
  type AgentChatState,
  type AgentChatStore,
  createAgentChatStore,
} from '@core/features/agent-chat/lib/agent-chat-store';

import { useStore } from 'zustand';

type AgentChatStoreApi = ReturnType<typeof createAgentChatStore>;

const AgentChatStoreContext = createContext<AgentChatStoreApi | null>(null);

/**
 * 채팅 패널 store를 공통 workspace layout에 한 번만 둔다. 페이지를 옮겨도 상태가 유지되고,
 * 로그인 사용자가 바뀌면 상위 session boundary가 remount해 store를 새로 만든다.
 */
export function AgentChatProvider({
  children,
  initialState,
}: {
  children: ReactNode;
  initialState?: Partial<AgentChatState>;
}) {
  const [store] = useState(() => createAgentChatStore(initialState));
  return (
    <AgentChatStoreContext.Provider value={store}>
      {children}
    </AgentChatStoreContext.Provider>
  );
}

export function useAgentChatStore<T>(
  selector: (state: AgentChatStore) => T,
): T {
  const store = useContext(AgentChatStoreContext);
  if (!store) {
    throw new Error('Agent Chat provider가 연결되지 않았습니다.');
  }
  return useStore(store, selector);
}
