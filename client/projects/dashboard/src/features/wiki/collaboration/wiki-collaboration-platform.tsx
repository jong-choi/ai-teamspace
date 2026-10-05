import { createContext, type ReactNode, useContext } from 'react';

export type WikiCollaborationLocalDocumentKey = {
  organizationId: string;
  documentId: string;
};

export type WikiCollaborationLocalStore = {
  load: () => Promise<readonly Uint8Array[]>;
  append: (update: Uint8Array) => Promise<void>;
  replaceWithSnapshot: (snapshot: Uint8Array) => Promise<void>;
  clear: () => Promise<void>;
  close: () => Promise<void>;
};

export type WikiEditorCompositionCallbacks = {
  onCompositionStart: () => void;
  onCompositionEnd: () => void;
};

export type WikiEditorSelectionRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type WikiEditorSelectionGeometry = {
  caret: WikiEditorSelectionRect;
  selectionRects: readonly WikiEditorSelectionRect[];
};

export type WikiCollaborationPlatformValue = {
  createLocalStore: (
    key: WikiCollaborationLocalDocumentKey,
  ) => Promise<WikiCollaborationLocalStore>;
  clearLocalStore: (key: WikiCollaborationLocalDocumentKey) => Promise<void>;
  bindEditorComposition: (
    handle: unknown,
    callbacks: WikiEditorCompositionCallbacks,
  ) => () => void;
  bindEditorGeometryInvalidation: (
    handle: unknown,
    onInvalidate: () => void,
  ) => () => void;
  measureEditorSelection: (
    handle: unknown,
    selection: { start: number; end: number },
  ) => WikiEditorSelectionGeometry | null;
};

const WikiCollaborationPlatformContext =
  createContext<WikiCollaborationPlatformValue | null>(null);

export function WikiCollaborationPlatformProvider({
  children,
  value,
}: {
  children: ReactNode;
  value: WikiCollaborationPlatformValue;
}) {
  return (
    <WikiCollaborationPlatformContext.Provider value={value}>
      {children}
    </WikiCollaborationPlatformContext.Provider>
  );
}

export function useWikiCollaborationPlatform(): WikiCollaborationPlatformValue {
  const value = useContext(WikiCollaborationPlatformContext);
  if (!value) {
    throw new Error('위키 공동편집 플랫폼 어댑터가 연결되지 않았습니다.');
  }
  return value;
}
