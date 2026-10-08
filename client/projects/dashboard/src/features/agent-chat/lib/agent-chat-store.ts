import type { AgentModelInfo } from '@repo/client/api-client/schemas';

import { createStore } from 'zustand/vanilla';

export type AgentReasoningEffort = AgentModelInfo['defaultReasoningEffort'];

export const AGENT_CHAT_NEW_THREAD_KEY = '__new__';
export const AGENT_CHAT_QUEUE_LIMIT = 5;

export type AgentQueuedMessage = {
  id: string;
  threadId: string;
  content: string;
  status: 'pending' | 'failed';
};

export type AgentChatState = {
  open: boolean;
  // 한 번이라도 열었으면 닫혀 있어도 session을 유지한다.
  everOpened: boolean;
  expanded: boolean;
  organizationId: string | null;
  activeThreadId: string | null;
  activeThreadTitle: string | null;
  drafts: Readonly<Record<string, string>>;
  pendingStarter: { threadId: string; message: string } | null;
  reasoningEffort: AgentReasoningEffort | null;
  queue: readonly AgentQueuedMessage[];
  pendingApproval: boolean;
};

export type AgentChatActions = {
  openPanel: () => void;
  closePanel: () => void;
  togglePanel: () => void;
  setExpanded: (expanded: boolean) => void;
  setOrganization: (organizationId: string) => void;
  selectThread: (threadId: string, title: string) => void;
  newThread: () => void;
  setDraft: (key: string, value: string) => void;
  startThread: (input: {
    threadId: string;
    title: string;
    message: string;
  }) => void;
  consumeStarter: (threadId: string) => void;
  setReasoningEffort: (effort: AgentReasoningEffort) => void;
  enqueue: (entry: { id: string; threadId: string; content: string }) => void;
  removeQueued: (id: string) => void;
  failQueued: (entry: {
    id: string;
    threadId: string;
    content: string;
  }) => void;
  setPendingApproval: (pending: boolean) => void;
};

export type AgentChatStore = AgentChatState & AgentChatActions;

export const initialAgentChatState: AgentChatState = {
  open: false,
  everOpened: false,
  expanded: false,
  organizationId: null,
  activeThreadId: null,
  activeThreadTitle: null,
  drafts: {},
  pendingStarter: null,
  reasoningEffort: null,
  queue: [],
  pendingApproval: false,
};

export function getAgentDraftKey(threadId: string | null): string {
  return threadId ?? AGENT_CHAT_NEW_THREAD_KEY;
}

/**
 * 채팅 패널의 client-local 상태 store다. 서버 데이터(thread, 메시지)는 React Query와 SDK가 소유한다.
 * workspace layout마다 하나를 만들어 로그인 사용자가 바뀌면 함께 버린다.
 */
export function createAgentChatStore(
  initialState: Partial<AgentChatState> = {},
) {
  return createStore<AgentChatStore>()((set) => ({
    ...initialAgentChatState,
    ...initialState,
    openPanel: () => set({ open: true, everOpened: true }),
    closePanel: () => set({ open: false }),
    togglePanel: () =>
      set((state) =>
        state.open ? { open: false } : { open: true, everOpened: true },
      ),
    setExpanded: (expanded) => set({ expanded }),
    setOrganization: (organizationId) =>
      set((state) =>
        state.organizationId === organizationId
          ? state
          : {
              // 조직이 바뀌면 이전 조직의 대화, draft, 큐를 남기지 않는다. 열림 상태와 추론 수준은 유지한다.
              ...initialAgentChatState,
              open: state.open,
              everOpened: state.everOpened,
              expanded: state.expanded,
              reasoningEffort: state.reasoningEffort,
              organizationId,
            },
      ),
    selectThread: (threadId, title) =>
      set({
        activeThreadId: threadId,
        activeThreadTitle: title,
        pendingApproval: false,
      }),
    newThread: () =>
      set({
        activeThreadId: null,
        activeThreadTitle: null,
        pendingApproval: false,
      }),
    setDraft: (key, value) =>
      set((state) => ({ drafts: { ...state.drafts, [key]: value } })),
    startThread: ({ threadId, title, message }) =>
      set((state) => {
        const drafts = { ...state.drafts };
        delete drafts[AGENT_CHAT_NEW_THREAD_KEY];
        return {
          drafts,
          activeThreadId: threadId,
          activeThreadTitle: title,
          pendingStarter: { threadId, message },
          pendingApproval: false,
        };
      }),
    consumeStarter: (threadId) =>
      set((state) =>
        state.pendingStarter?.threadId === threadId
          ? { pendingStarter: null }
          : state,
      ),
    setReasoningEffort: (reasoningEffort) => set({ reasoningEffort }),
    enqueue: ({ id, threadId, content }) =>
      set((state) =>
        state.queue.filter((entry) => entry.threadId === threadId).length >=
        AGENT_CHAT_QUEUE_LIMIT
          ? state
          : {
              queue: [
                ...state.queue,
                { id, threadId, content, status: 'pending' },
              ],
            },
      ),
    removeQueued: (id) =>
      set((state) => ({
        queue: state.queue.filter((entry) => entry.id !== id),
      })),
    failQueued: ({ id, threadId, content }) =>
      set((state) => ({
        queue: [
          ...state.queue.filter((entry) => entry.id !== id),
          { id, threadId, content, status: 'failed' },
        ],
      })),
    setPendingApproval: (pendingApproval) =>
      set((state) =>
        state.pendingApproval === pendingApproval ? state : { pendingApproval },
      ),
  }));
}

export function resolveAgentReasoningEffort(
  selected: AgentReasoningEffort | null,
  model: AgentModelInfo,
): AgentReasoningEffort {
  if (selected && model.supportedReasoningEfforts.includes(selected)) {
    return selected;
  }
  return model.defaultReasoningEffort;
}
