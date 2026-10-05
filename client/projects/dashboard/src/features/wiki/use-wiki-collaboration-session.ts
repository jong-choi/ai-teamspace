import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';

import { useWikiControllerCreateCollaborationSession } from '@repo/client/api-client';
import {
  collectWikiCollaborators,
  type WikiCollaborator,
} from '@core/features/wiki/collaboration/wiki-awareness';
import {
  classifyWikiCollaborationAuthenticationFailure,
  isWikiCollaborationSessionAccessDenied,
} from '@core/features/wiki/collaboration/wiki-collaboration-auth';
import {
  useWikiCollaborationPlatform,
  type WikiCollaborationLocalStore,
} from '@core/features/wiki/collaboration/wiki-collaboration-platform';
import {
  deriveWikiCollaborationIndicator,
  type WikiCollaborationConnectionState,
  type WikiCollaborationIndicator,
} from '@core/features/wiki/collaboration/wiki-collaboration-state';
import { createWikiRelativeSelection } from '@core/features/wiki/collaboration/wiki-relative-selection';
import {
  bindWikiYText,
  type WikiYTextBinding,
} from '@core/features/wiki/collaboration/wiki-ytext-binding';

import { HocuspocusProvider, WebSocketStatus } from '@hocuspocus/provider';
import * as Y from 'yjs';
import { z } from 'zod';

export type WikiEditorMode = 'view' | 'edit' | 'split';
export type { WikiCollaborationIndicator } from '@core/features/wiki/collaboration/wiki-collaboration-state';

type CollaborationRuntime = {
  document: Y.Doc;
  text: Y.Text;
  provider: HocuspocusProvider | null;
  binding: WikiYTextBinding | null;
  localStore: WikiCollaborationLocalStore | null;
  undoManager: Y.UndoManager;
  pendingLocalPersistence: Promise<void>;
  localPersisted: boolean;
  localPersistenceFailed: boolean;
  updateVersion: number;
  persistedVersion: number;
  appendCount: number;
  hasUsableState: boolean;
  localRecoveryReady: boolean;
};

const serverPersistenceErrorSchema = z.object({
  type: z.literal('server-persistence-error'),
});
const localStoreCompactionUpdateCount = 200;
const leaveSyncTimeoutMilliseconds = 1_000;
const authenticationRefreshLeadMilliseconds = 30_000;
const authenticationRefreshRetryMilliseconds = 5_000;

export function useWikiCollaborationSession(input: {
  documentId: string;
  organizationId: string;
}) {
  const platform = useWikiCollaborationPlatform();
  const { mutateAsync: createCollaborationSession } =
    useWikiControllerCreateCollaborationSession();
  const localOrigin = useRef<object>({ kind: 'wiki-local-editor' }).current;
  const runtimeRef = useRef<CollaborationRuntime | null>(null);
  const [mode, setMode] = useState<WikiEditorMode>('view');
  const [liveMarkdown, setLiveMarkdown] = useState('');
  const [editorMarkdown, setEditorMarkdown] = useState('');
  const [collaborators, setCollaborators] = useState<WikiCollaborator[]>([]);
  const [connectionState, setConnectionState] =
    useState<WikiCollaborationConnectionState>('connecting');
  const [readOnly, setReadOnly] = useState(false);
  const [localPersisted, setLocalPersisted] = useState(false);
  const [localPersistenceError, setLocalPersistenceError] = useState(false);
  const [serverPersistenceError, setServerPersistenceError] = useState(false);
  const [authReconnecting, setAuthReconnecting] = useState(false);
  const [accessDenied, setAccessDenied] = useState(false);
  const [updateRequired, setUpdateRequired] = useState(false);
  const [hasLocalRecovery, setHasLocalRecovery] = useState(false);

  useLayoutEffect(() => {
    let disposed = false;
    let localStore: Awaited<
      ReturnType<typeof platform.createLocalStore>
    > | null = null;
    let authenticationRefreshRunning = false;
    let authenticationRefreshTimer: ReturnType<typeof setTimeout> | null = null;
    let recoverySnapshotPromise: Promise<void> | null = null;
    const document = new Y.Doc();
    const text = document.getText('markdown');
    const undoManager = new Y.UndoManager(text, {
      trackedOrigins: new Set([localOrigin]),
    });
    const runtime: CollaborationRuntime = {
      document,
      text,
      provider: null,
      binding: null,
      localStore: null,
      undoManager,
      pendingLocalPersistence: Promise.resolve(),
      localPersisted: false,
      localPersistenceFailed: false,
      updateVersion: 0,
      persistedVersion: 0,
      appendCount: 0,
      hasUsableState: false,
      localRecoveryReady: false,
    };
    runtimeRef.current = runtime;
    setMode('view');
    setLiveMarkdown('');
    setEditorMarkdown('');
    setCollaborators([]);
    setConnectionState('connecting');
    setReadOnly(false);
    setLocalPersisted(false);
    setLocalPersistenceError(false);
    setServerPersistenceError(false);
    setAuthReconnecting(false);
    setAccessDenied(false);
    setUpdateRequired(false);
    setHasLocalRecovery(false);

    const refreshCollaborators = () => {
      const awareness = runtime.provider?.awareness;
      if (!awareness || disposed) return;
      setCollaborators(
        collectWikiCollaborators({
          document,
          text,
          states: awareness.getStates(),
          localClientId: document.clientID,
        }),
      );
    };

    const persistLocalUpdate = (update: Uint8Array) => {
      runtime.updateVersion += 1;
      const updateVersion = runtime.updateVersion;
      runtime.localPersisted = false;
      setLocalPersisted(false);
      if (!localStore) {
        runtime.localPersistenceFailed = true;
        setLocalPersistenceError(true);
        return;
      }

      const operation = runtime.pendingLocalPersistence
        .catch(() => undefined)
        .then(async () => {
          if (disposed) return;
          await localStore?.append(new Uint8Array(update));
          runtime.appendCount += 1;
          if (runtime.appendCount >= localStoreCompactionUpdateCount) {
            await localStore?.replaceWithSnapshot(
              Y.encodeStateAsUpdate(document),
            );
            runtime.appendCount = 0;
          }
          runtime.persistedVersion = Math.max(
            runtime.persistedVersion,
            updateVersion,
          );
          runtime.localPersistenceFailed = false;
          if (runtime.persistedVersion === runtime.updateVersion) {
            runtime.localPersisted = true;
            if (!disposed) {
              setLocalPersisted(true);
              setLocalPersistenceError(false);
            }
          }
        })
        .catch(() => {
          runtime.localPersistenceFailed = true;
          runtime.localPersisted = false;
          if (!disposed) {
            setLocalPersistenceError(true);
            setLocalPersisted(false);
          }
          throw new Error('위키 공동편집 로컬 저장에 실패했습니다.');
        });
      runtime.pendingLocalPersistence = operation;
      void operation.catch(() => undefined);
    };

    const ensureRecoverySnapshot = (): Promise<void> => {
      if (runtime.localRecoveryReady || !localStore) {
        return Promise.resolve();
      }
      if (recoverySnapshotPromise) {
        return recoverySnapshotPromise;
      }

      const snapshotVersion = runtime.updateVersion;
      const snapshot = Y.encodeStateAsUpdate(document);
      const operation = runtime.pendingLocalPersistence
        .catch(() => undefined)
        .then(async () => {
          if (disposed || !localStore) return;
          await localStore.replaceWithSnapshot(snapshot);
          runtime.localRecoveryReady = true;
          runtime.persistedVersion = Math.max(
            runtime.persistedVersion,
            snapshotVersion,
          );
          runtime.localPersistenceFailed = false;
          runtime.localPersisted =
            runtime.persistedVersion === runtime.updateVersion;
          if (!disposed) {
            setHasLocalRecovery(true);
            setLocalPersisted(runtime.localPersisted);
            setLocalPersistenceError(false);
          }
        })
        .catch(() => {
          runtime.localRecoveryReady = false;
          runtime.localPersistenceFailed = true;
          runtime.localPersisted = false;
          if (!disposed) {
            setLocalPersistenceError(true);
            setLocalPersisted(false);
          }
          throw new Error('위키 공동편집 복구 스냅샷 저장에 실패했습니다.');
        })
        .finally(() => {
          recoverySnapshotPromise = null;
        });
      recoverySnapshotPromise = operation;
      runtime.pendingLocalPersistence = operation;
      return operation;
    };

    const documentUpdateHandler = (update: Uint8Array) => {
      persistLocalUpdate(update);
      if (!disposed) {
        setLiveMarkdown(text.toString());
      }
    };

    const start = async () => {
      try {
        localStore = await platform.createLocalStore({
          organizationId: input.organizationId,
          documentId: input.documentId,
        });
        runtime.localStore = localStore;
        const updates = await localStore.load();
        for (const update of updates) {
          Y.applyUpdate(document, update, localStore);
        }
        if (updates.length > 0) {
          runtime.hasUsableState = true;
          runtime.localRecoveryReady = true;
          setHasLocalRecovery(true);
        }
        runtime.localPersisted = true;
        setLocalPersisted(true);
      } catch {
        runtime.localPersistenceFailed = true;
        setLocalPersistenceError(true);
      }
      if (disposed) return;

      const initialMarkdown = text.toString();
      setLiveMarkdown(initialMarkdown);
      setEditorMarkdown(initialMarkdown);
      runtime.binding = bindWikiYText({
        text,
        localOrigin,
        onRemoteText: (nextText) => {
          if (!disposed) setEditorMarkdown(nextText);
        },
      });
      document.on('update', documentUpdateHandler);

      const session = await createCollaborationSession({
        organizationId: input.organizationId,
        documentId: input.documentId,
      });
      if (disposed) return;

      let authorizationExpiresAt = new Date(session.expiresAt).getTime();
      const refreshAuthentication = async () => {
        if (disposed || authenticationRefreshRunning) return;
        authenticationRefreshRunning = true;
        setAuthReconnecting(true);
        try {
          const refreshed = await createCollaborationSession({
            organizationId: input.organizationId,
            documentId: input.documentId,
          });
          if (disposed) return;
          if (
            refreshed.documentName !== session.documentName ||
            refreshed.protocolVersion !== session.protocolVersion
          ) {
            throw new Error('위키 공동편집 session scope가 변경되었습니다.');
          }
          authorizationExpiresAt = new Date(refreshed.expiresAt).getTime();
          provider.setConfiguration({ token: refreshed.token });
          await provider.sendToken();
          setAuthReconnecting(false);
          scheduleAuthenticationRefresh();
        } catch (error) {
          if (!disposed && isWikiCollaborationSessionAccessDenied(error)) {
            setAccessDenied(true);
            setAuthReconnecting(false);
            setMode('view');
            setConnectionState('offline');
            provider.configuration.websocketProvider.disconnect();
          } else if (!disposed) {
            setAuthReconnecting(true);
            scheduleAuthenticationRefresh(
              authenticationRefreshRetryMilliseconds,
            );
          }
        } finally {
          authenticationRefreshRunning = false;
        }
      };
      function scheduleAuthenticationRefresh(delayMilliseconds?: number) {
        if (authenticationRefreshTimer) {
          clearTimeout(authenticationRefreshTimer);
        }
        const delay =
          delayMilliseconds ??
          Math.max(
            0,
            authorizationExpiresAt -
              Date.now() -
              authenticationRefreshLeadMilliseconds,
          );
        authenticationRefreshTimer = setTimeout(() => {
          authenticationRefreshTimer = null;
          void refreshAuthentication();
        }, delay);
      }

      const provider = new HocuspocusProvider({
        url: withProtocolVersion(session.webSocketUrl, session.protocolVersion),
        name: session.documentName,
        document,
        token: session.token,
        flushDelay: 100,
        onAuthenticated: ({ scope }) => {
          const nextReadOnly = scope === 'readonly';
          setReadOnly(nextReadOnly);
          setAccessDenied(false);
          setUpdateRequired(false);
          setAuthReconnecting(false);
          setServerPersistenceError(false);
          if (nextReadOnly) {
            setMode('view');
          }
          setConnectionState('syncing');
          provider.setAwarenessField('selection', null);
        },
        onAuthenticationFailed: ({ reason }) => {
          const action = classifyWikiCollaborationAuthenticationFailure(reason);
          if (action === 'update-required') {
            setUpdateRequired(true);
            setAccessDenied(false);
            setAuthReconnecting(false);
            setMode('view');
            setConnectionState('offline');
            provider.configuration.websocketProvider.disconnect();
            return;
          }
          if (action === 'access-denied') {
            setAccessDenied(true);
            setUpdateRequired(false);
            setAuthReconnecting(false);
            setMode('view');
            setConnectionState('offline');
            provider.configuration.websocketProvider.disconnect();
            return;
          }
          void refreshAuthentication();
        },
        onStatus: ({ status }) => {
          if (status === WebSocketStatus.Disconnected) {
            setConnectionState('offline');
          } else if (status === WebSocketStatus.Connecting) {
            setConnectionState('connecting');
          }
        },
        onSynced: ({ state }) => {
          if (!state) return;
          runtime.hasUsableState = true;
          setLiveMarkdown(text.toString());
          if (!runtime.localRecoveryReady && localStore) {
            setConnectionState('syncing');
            void ensureRecoverySnapshot()
              .catch(() => undefined)
              .finally(() => {
                if (disposed) return;
                setConnectionState(
                  provider.hasUnsyncedChanges ? 'syncing' : 'synced',
                );
              });
            return;
          }
          setConnectionState(
            provider.hasUnsyncedChanges ? 'syncing' : 'synced',
          );
        },
        onUnsyncedChanges: ({ number }) => {
          if (number > 0) {
            setConnectionState('syncing');
          } else if (provider.isSynced) {
            setConnectionState('synced');
          }
        },
        onAwarenessChange: refreshCollaborators,
        onStateless: ({ payload }) => {
          try {
            const parsedJson: unknown = JSON.parse(payload);
            if (serverPersistenceErrorSchema.safeParse(parsedJson).success) {
              setServerPersistenceError(true);
            }
          } catch {
            // 이해할 수 없는 stateless payload는 공동편집 상태에 반영하지 않는다.
          }
        },
      });
      runtime.provider = provider;
      scheduleAuthenticationRefresh();
    };

    void start().catch((error: unknown) => {
      if (!disposed) {
        if (isWikiCollaborationSessionAccessDenied(error)) {
          setAccessDenied(true);
          setMode('view');
        }
        setAuthReconnecting(false);
        setConnectionState('offline');
      }
    });

    return () => {
      disposed = true;
      if (authenticationRefreshTimer) {
        clearTimeout(authenticationRefreshTimer);
      }
      document.off('update', documentUpdateHandler);
      runtime.binding?.destroy();
      runtime.provider?.destroy();
      runtimeRef.current = null;
      const finalize = async () => {
        await runtime.pendingLocalPersistence.catch(() => undefined);
        await localStore?.close().catch(() => undefined);
        undoManager.destroy();
        document.destroy();
      };
      void finalize();
    };
  }, [
    input.documentId,
    input.organizationId,
    localOrigin,
    platform,
    createCollaborationSession,
  ]);

  const editModeDisabled =
    readOnly || accessDenied || updateRequired || localPersistenceError;

  const requestMode = useCallback(
    (nextMode: WikiEditorMode) => {
      if (nextMode !== 'view' && editModeDisabled) return;
      setMode(nextMode);
    },
    [editModeDisabled],
  );

  const setMarkdown = useCallback(
    (nextMarkdown: string) => {
      const runtime = runtimeRef.current;
      if (!runtime || editModeDisabled) return;
      runtime.binding?.applyLocalText(nextMarkdown);
      setEditorMarkdown(nextMarkdown);
    },
    [editModeDisabled],
  );

  const beginComposition = useCallback(() => {
    runtimeRef.current?.binding?.beginComposition();
  }, []);

  const endComposition = useCallback(() => {
    runtimeRef.current?.binding?.endComposition();
  }, []);

  const updateSelection = useCallback(
    (selection: { start: number; end: number }) => {
      const runtime = runtimeRef.current;
      if (!runtime?.provider?.awareness) return;
      runtime.provider.setAwarenessField(
        'selection',
        createWikiRelativeSelection(runtime.text, selection),
      );
    },
    [],
  );

  const prepareToLeave = useCallback(async (): Promise<boolean> => {
    const runtime = runtimeRef.current;
    if (!runtime) return true;
    await runtime.pendingLocalPersistence.catch(() => undefined);
    const provider = runtime.provider;
    if (!provider?.hasUnsyncedChanges) return true;

    provider.flushPendingUpdates();
    provider.forceSync();
    await waitForProviderSync(provider, leaveSyncTimeoutMilliseconds);
    if (!provider.hasUnsyncedChanges) return true;
    return runtime.localPersisted && !runtime.localPersistenceFailed;
  }, []);

  const clearLocalState = useCallback(async (): Promise<void> => {
    const runtime = runtimeRef.current;
    if (!runtime) {
      await platform.clearLocalStore({
        organizationId: input.organizationId,
        documentId: input.documentId,
      });
      return;
    }
    await runtime.pendingLocalPersistence.catch(() => undefined);
    if (runtime.localStore) {
      await runtime.localStore.clear();
    } else {
      await platform.clearLocalStore({
        organizationId: input.organizationId,
        documentId: input.documentId,
      });
    }
    runtime.localRecoveryReady = false;
    runtime.localPersisted = false;
    runtime.localPersistenceFailed = false;
    setHasLocalRecovery(false);
    setLocalPersisted(false);
    setLocalPersistenceError(false);
  }, [input.documentId, input.organizationId, platform]);

  const exportMarkdown = useCallback((persistedMarkdown: string): string => {
    const runtime = runtimeRef.current;
    return runtime?.hasUsableState
      ? runtime.text.toString()
      : persistedMarkdown;
  }, []);

  const undo = useCallback(() => runtimeRef.current?.undoManager.undo(), []);
  const redo = useCallback(() => runtimeRef.current?.undoManager.redo(), []);

  const indicator = useMemo<WikiCollaborationIndicator>(
    () =>
      deriveWikiCollaborationIndicator({
        accessDenied,
        authReconnecting,
        connectionState,
        hasLocalRecovery,
        localPersisted,
        localPersistenceError,
        readOnly,
        serverPersistenceError,
        updateRequired,
      }),
    [
      accessDenied,
      authReconnecting,
      connectionState,
      hasLocalRecovery,
      localPersisted,
      localPersistenceError,
      readOnly,
      serverPersistenceError,
      updateRequired,
    ],
  );

  const editable =
    !editModeDisabled &&
    (connectionState === 'synced' ||
      (connectionState === 'offline' && hasLocalRecovery) ||
      (serverPersistenceError && localPersisted));

  return {
    beginComposition,
    clearLocalState,
    collaborators,
    editModeDisabled,
    editable,
    editorMarkdown,
    endComposition,
    exportMarkdown,
    indicator,
    liveMarkdown,
    mode,
    prepareToLeave,
    redo,
    requestMode,
    setMarkdown,
    undo,
    updateSelection,
  };
}

function withProtocolVersion(
  webSocketUrl: string,
  protocolVersion: number,
): string {
  const separator = webSocketUrl.includes('?') ? '&' : '?';
  return `${webSocketUrl}${separator}protocolVersion=${encodeURIComponent(String(protocolVersion))}`;
}

async function waitForProviderSync(
  provider: HocuspocusProvider,
  timeoutMilliseconds: number,
): Promise<void> {
  if (!provider.hasUnsyncedChanges) return;
  const startedAt = Date.now();
  while (
    provider.hasUnsyncedChanges &&
    Date.now() - startedAt < timeoutMilliseconds
  ) {
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}
