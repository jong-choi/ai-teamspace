import { createStore } from 'zustand/vanilla';

export type GraphSelection =
  { kind: 'node'; id: string } | { kind: 'edge'; id: string };

export type GraphDialog =
  | { type: 'node-create' }
  | { type: 'node-edit'; nodeId: string }
  | { type: 'node-correct'; nodeId: string }
  | { type: 'node-delete'; nodeId: string }
  | { type: 'edge-create'; sourceNodeId: string | null }
  | { type: 'edge-edit'; edgeId: string }
  | { type: 'edge-correct'; edgeId: string }
  | { type: 'edge-delete'; edgeId: string };

export type GraphPoint = { x: number; y: number };

export type GraphStudioState = {
  // provider가 만들어질 때 고정되는 조직 scope다.
  organizationId: string;
  selection: GraphSelection | null;
  // 열린 dirty form은 하나만 둔다.
  dialog: GraphDialog | null;
  // 사용자가 드래그로 고정한 표시 좌표다. 서버 원본이나 Outbox와 무관하다.
  pinnedPositions: Readonly<Record<string, GraphPoint>>;
};

export type GraphStudioActions = {
  select: (selection: GraphSelection) => void;
  clearSelection: () => void;
  openDialog: (dialog: GraphDialog) => void;
  closeDialog: () => void;
  pinNode: (nodeId: string, point: GraphPoint) => void;
  resetPins: () => void;
  forgetNode: (nodeId: string) => void;
  forgetEdge: (edgeId: string) => void;
};

export type GraphStudioStore = GraphStudioState & GraphStudioActions;

export const initialGraphStudioState: Omit<GraphStudioState, 'organizationId'> =
  {
    selection: null,
    dialog: null,
    pinnedPositions: {},
  };

/**
 * 그래프 뷰·데이터 센터·inspector·모달이 함께 쓰는 client-local 상태다.
 * 서버 record는 React Query가, 보기 모드·필터·cursor는 route가 소유한다.
 * 조직마다 provider를 다시 만들어 이전 조직의 선택과 편집 대상을 남기지 않는다.
 */
export function createGraphStudioStore(
  organizationId: string,
  initialState: Partial<Omit<GraphStudioState, 'organizationId'>> = {},
) {
  return createStore<GraphStudioStore>()((set) => ({
    ...initialGraphStudioState,
    ...initialState,
    organizationId,
    select: (selection) => set({ selection }),
    clearSelection: () => set({ selection: null }),
    openDialog: (dialog) => set((state) => (state.dialog ? state : { dialog })),
    closeDialog: () => set({ dialog: null }),
    pinNode: (nodeId, point) =>
      set((state) => ({
        pinnedPositions: { ...state.pinnedPositions, [nodeId]: point },
      })),
    resetPins: () => set({ pinnedPositions: {} }),
    forgetNode: (nodeId) =>
      set((state) => {
        const pinnedPositions = Object.fromEntries(
          Object.entries(state.pinnedPositions).filter(([id]) => id !== nodeId),
        );
        return {
          pinnedPositions,
          selection:
            state.selection?.kind === 'node' && state.selection.id === nodeId
              ? null
              : state.selection,
        };
      }),
    forgetEdge: (edgeId) =>
      set((state) => ({
        selection:
          state.selection?.kind === 'edge' && state.selection.id === edgeId
            ? null
            : state.selection,
      })),
  }));
}
