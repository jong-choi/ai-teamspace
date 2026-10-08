import { createContext, type ReactNode, useContext, useState } from 'react';

import {
  createGraphStudioStore,
  type GraphStudioState,
  type GraphStudioStore,
} from '@core/features/knowledge-graph/state/graph-studio-store';

import { useStore } from 'zustand';

type GraphStudioStoreApi = ReturnType<typeof createGraphStudioStore>;

const GraphStudioStoreContext = createContext<GraphStudioStoreApi | null>(null);

/**
 * 그래프 화면 공용 store를 route frame에서 한 번 만든다.
 * 상위에서 조직 ID를 key로 remount하므로 조직 전환 때 상태가 새로 시작한다.
 */
export function GraphStudioProvider({
  children,
  initialState,
  organizationId,
}: {
  children: ReactNode;
  initialState?: Partial<Omit<GraphStudioState, 'organizationId'>>;
  organizationId: string;
}) {
  const [store] = useState(() =>
    createGraphStudioStore(organizationId, initialState),
  );
  return (
    <GraphStudioStoreContext.Provider value={store}>
      {children}
    </GraphStudioStoreContext.Provider>
  );
}

export function useGraphStudioStore<T>(
  selector: (state: GraphStudioStore) => T,
): T {
  const store = useContext(GraphStudioStoreContext);
  if (!store) {
    throw new Error('그래프 스튜디오 provider가 연결되지 않았습니다.');
  }
  return useStore(store, selector);
}
