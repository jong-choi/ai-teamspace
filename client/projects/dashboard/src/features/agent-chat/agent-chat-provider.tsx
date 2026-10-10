import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useState,
} from 'react';
import { Dimensions, Platform } from 'react-native';

import {
  type AgentChatState,
  type AgentChatStore,
  createAgentChatStore,
} from '@core/features/agent-chat/lib/agent-chat-store';
import { AGENT_CHAT_WIDE_MIN_WIDTH } from '@core/features/agent-chat/lib/use-agent-chat-layout';

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

  // Web의 넓은 창에서는 패널을 연 채로 시작한다. 좁은 창과 native는 닫힌 채로 둔다.
  useEffect(() => {
    if (
      Platform.OS === 'web' &&
      Dimensions.get('window').width >= AGENT_CHAT_WIDE_MIN_WIDTH
    ) {
      store.getState().openPanel();
    }
  }, [store]);

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
