import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useRef,
} from 'react';

type AgentChatNavigationValue = {
  stageStarter(threadId: string, message: string): void;
  peekStarter(threadId: string): string | null;
  clearStarter(threadId: string): void;
};

const AgentChatNavigationContext =
  createContext<AgentChatNavigationValue | null>(null);

export function AgentChatNavigationProvider({
  children,
}: {
  children: ReactNode;
}) {
  const starters = useRef(new Map<string, string>());

  const stageStarter = useCallback((threadId: string, message: string) => {
    const normalized = message.trim();
    if (!normalized) return;
    starters.current.set(threadId, normalized);
  }, []);

  const peekStarter = useCallback(
    (threadId: string): string | null => starters.current.get(threadId) ?? null,
    [],
  );

  const clearStarter = useCallback((threadId: string) => {
    starters.current.delete(threadId);
  }, []);

  const value = useMemo(
    () => ({ stageStarter, peekStarter, clearStarter }),
    [clearStarter, peekStarter, stageStarter],
  );

  return (
    <AgentChatNavigationContext.Provider value={value}>
      {children}
    </AgentChatNavigationContext.Provider>
  );
}

export function useAgentChatNavigation(): AgentChatNavigationValue {
  const value = useContext(AgentChatNavigationContext);
  if (!value) {
    throw new Error('Agent Chat navigation provider가 연결되지 않았습니다.');
  }
  return value;
}
