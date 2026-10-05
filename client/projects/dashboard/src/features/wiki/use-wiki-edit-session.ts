import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  getWikiControllerGetDocumentQueryKey,
  getWikiControllerGetTreeQueryKey,
  getWikiControllerListDocumentHistoryQueryKey,
  useWikiControllerAcquireEditLock,
  useWikiControllerReleaseEditLock,
  useWikiControllerRenewEditLock,
  useWikiControllerSaveDocumentContent,
  wikiControllerReleaseEditLock,
} from '@repo/client/api-client';
import type {
  WikiDocument,
  WikiDocumentSaveResult,
  WikiEditLockState,
} from '@repo/client/api-client/schemas';
import { useMutationErrorNotification } from '@core/app/error/use-mutation-error-notification';
import { useDashboardPlatform } from '@core/app/platform/dashboard-platform';

import { useQueryClient } from '@tanstack/react-query';

export type WikiEditorMode = 'view' | 'edit' | 'split';

export type WikiSaveIndicator = {
  label: string;
  tone: 'saved' | 'pending' | 'warning' | 'error' | 'locked';
};

type WikiEditSessionOptions = {
  document: WikiDocument;
  onConflictCopy: (document: WikiDocument) => void | Promise<void>;
  organizationId: string;
};

type SaveOutcome = 'noop' | 'saved' | 'conflict' | 'error';

const AUTO_SAVE_DELAY_MS = 900;
const MIN_RENEW_DELAY_MS = 5_000;
const MAX_RENEW_DELAY_MS = 30_000;

export function useWikiEditSession({
  document,
  onConflictCopy,
  organizationId,
}: WikiEditSessionOptions) {
  const queryClient = useQueryClient();
  const { notifyError, notifySuccess } = useDashboardPlatform();
  const [mode, setMode] = useState<WikiEditorMode>('view');
  const [draft, setDraftState] = useState(document.contentMarkdown);
  const [lastSaveOutcome, setLastSaveOutcome] = useState<
    'idle' | 'saved' | 'error' | 'conflict'
  >('saved');

  const modeRef = useRef(mode);
  const draftRef = useRef(draft);
  const saveInFlightRef = useRef<Promise<SaveOutcome> | null>(null);
  const saveAgainRef = useRef(false);
  modeRef.current = mode;

  const changeMode = useCallback((nextMode: WikiEditorMode) => {
    modeRef.current = nextMode;
    setMode(nextMode);
  }, []);

  const notifyLockError = useMutationErrorNotification({
    id: 'wiki-edit-lock',
    title: '편집 잠금을 확인하지 못했습니다',
    fallback: '잠시 후 다시 시도해 주세요.',
  });
  const notifySaveError = useMutationErrorNotification({
    id: 'wiki-document-save',
    title: '위키 문서를 저장하지 못했습니다',
    fallback: '작성 내용은 편집기에 남아 있습니다. 잠시 후 다시 저장해 주세요.',
  });

  const {
    data: acquiredLockState,
    isPending: acquirePending,
    mutateAsync: acquireLock,
    reset: resetAcquireLock,
  } = useWikiControllerAcquireEditLock({
    mutation: { onError: notifyLockError },
  });
  const {
    data: renewedLockState,
    isError: renewError,
    mutateAsync: renewLock,
    reset: resetRenewLock,
  } = useWikiControllerRenewEditLock({
    mutation: { onError: notifyLockError },
  });
  const { mutateAsync: releaseEditLock } = useWikiControllerReleaseEditLock({
    mutation: { onError: notifyLockError },
  });
  const {
    isError: saveError,
    isPending: savePending,
    mutateAsync: saveDocumentContent,
  } = useWikiControllerSaveDocumentContent({
    mutation: { onError: notifySaveError },
  });

  const latestLockState = useMemo<WikiEditLockState | undefined>(
    () => renewedLockState ?? acquiredLockState,
    [acquiredLockState, renewedLockState],
  );
  const ownsLock =
    mode !== 'view' && !renewError && latestLockState?.ownedByActor === true;

  const getCanonicalDocument = useCallback(
    () =>
      queryClient.getQueryData<WikiDocument>(
        getWikiControllerGetDocumentQueryKey(organizationId, document.id),
      ) ?? document,
    [document, organizationId, queryClient],
  );
  const canonicalContentMarkdown = getCanonicalDocument().contentMarkdown;

  const setDraft = useCallback((value: string) => {
    draftRef.current = value;
    setDraftState(value);
    setLastSaveOutcome('idle');
  }, []);

  const updateDocumentCache = useCallback(
    (nextDocument: WikiDocument) => {
      queryClient.setQueryData(
        getWikiControllerGetDocumentQueryKey(organizationId, nextDocument.id),
        nextDocument,
      );
    },
    [organizationId, queryClient],
  );

  const invalidateWikiAfterSave = useCallback(
    async (documentId: string) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: getWikiControllerGetTreeQueryKey(organizationId),
        }),
        queryClient.invalidateQueries({
          queryKey: getWikiControllerListDocumentHistoryQueryKey(
            organizationId,
            documentId,
          ),
        }),
      ]);
    },
    [organizationId, queryClient],
  );

  const releaseLock = useCallback(async () => {
    if (latestLockState?.ownedByActor !== true) return;

    try {
      await releaseEditLock({ organizationId, documentId: document.id });
    } finally {
      resetAcquireLock();
      resetRenewLock();
    }
  }, [
    document.id,
    latestLockState?.ownedByActor,
    organizationId,
    releaseEditLock,
    resetAcquireLock,
    resetRenewLock,
  ]);

  const handleSaveResult = useCallback(
    async (result: WikiDocumentSaveResult): Promise<SaveOutcome> => {
      if (result.status === 'conflict-copy-created') {
        if (!result.conflictCopy) {
          setLastSaveOutcome('error');
          notifyError({
            id: 'wiki-conflict-copy-missing',
            title: '충돌본 응답을 확인하지 못했습니다',
            description:
              '작성 내용은 편집기에 남아 있습니다. 다시 저장해 주세요.',
          });
          return 'error';
        }

        updateDocumentCache(result.document);
        updateDocumentCache(result.conflictCopy);
        setLastSaveOutcome('conflict');
        await invalidateWikiAfterSave(result.document.id);
        await releaseLock().catch(() => undefined);
        changeMode('view');
        notifySuccess({
          id: 'wiki-conflict-copy',
          title: '충돌본을 안전하게 저장했습니다',
          description: `${result.conflictCopy.title} 문서로 이동합니다.`,
        });
        await onConflictCopy(result.conflictCopy);
        return 'conflict';
      }

      updateDocumentCache(result.document);
      setLastSaveOutcome('saved');
      await invalidateWikiAfterSave(result.document.id);
      return 'saved';
    },
    [
      changeMode,
      invalidateWikiAfterSave,
      notifyError,
      notifySuccess,
      onConflictCopy,
      releaseLock,
      updateDocumentCache,
    ],
  );

  const saveLatestDraft = useCallback(async (): Promise<SaveOutcome> => {
    if (saveInFlightRef.current) {
      saveAgainRef.current = true;
      return saveInFlightRef.current;
    }

    const run = async (): Promise<SaveOutcome> => {
      let outcome: SaveOutcome = 'noop';

      do {
        saveAgainRef.current = false;
        const contentMarkdown = draftRef.current;
        const canonicalDocument = getCanonicalDocument();

        if (contentMarkdown === canonicalDocument.contentMarkdown) {
          continue;
        }

        if (!ownsLock) {
          setLastSaveOutcome('error');
          return 'error';
        }

        try {
          const result = await saveDocumentContent({
            organizationId,
            documentId: document.id,
            data: {
              contentMarkdown,
              baseRevision: canonicalDocument.revision,
            },
          });
          outcome = await handleSaveResult(result);
          if (outcome === 'conflict') return outcome;
        } catch {
          setLastSaveOutcome('error');
          return 'error';
        }

        if (draftRef.current !== getCanonicalDocument().contentMarkdown) {
          saveAgainRef.current = true;
        }
      } while (saveAgainRef.current);

      return outcome;
    };

    const promise = run();
    saveInFlightRef.current = promise;
    try {
      return await promise;
    } finally {
      if (saveInFlightRef.current === promise) saveInFlightRef.current = null;
    }
  }, [
    document.id,
    getCanonicalDocument,
    handleSaveResult,
    organizationId,
    ownsLock,
    saveDocumentContent,
  ]);

  const acquireLockForMode = useCallback(
    async (nextMode: Exclude<WikiEditorMode, 'view'>): Promise<boolean> => {
      if (acquirePending) return false;
      resetAcquireLock();
      resetRenewLock();

      try {
        const lock = await acquireLock({
          organizationId,
          documentId: document.id,
        });

        if (!lock.ownedByActor) {
          notifyError({
            id: 'wiki-edit-locked',
            title: '다른 사용자가 편집 중입니다',
            description: lock.lockedBy
              ? `현재 편집자: ${lock.lockedBy}`
              : '잠금이 해제되거나 만료된 뒤 다시 편집을 시도해 주세요.',
          });
          return false;
        }

        const canonicalDocument = getCanonicalDocument();
        draftRef.current = canonicalDocument.contentMarkdown;
        setDraftState(canonicalDocument.contentMarkdown);
        setLastSaveOutcome('saved');
        changeMode(nextMode);
        return true;
      } catch {
        return false;
      }
    },
    [
      acquireLock,
      acquirePending,
      changeMode,
      document.id,
      getCanonicalDocument,
      notifyError,
      organizationId,
      resetAcquireLock,
      resetRenewLock,
    ],
  );

  const prepareToLeave = useCallback(async (): Promise<boolean> => {
    if (mode === 'view') return true;

    if (draftRef.current !== getCanonicalDocument().contentMarkdown) {
      const outcome = await saveLatestDraft();
      if (outcome === 'error') {
        notifyError({
          id: 'wiki-unsaved-draft',
          title: '저장하지 않은 내용이 남아 있습니다',
          description:
            '문서를 이동하지 않았습니다. 저장 상태를 확인한 뒤 다시 시도해 주세요.',
        });
        return false;
      }
      if (outcome === 'conflict') return false;
    }

    await releaseLock().catch(() => undefined);
    changeMode('view');
    return true;
  }, [
    changeMode,
    getCanonicalDocument,
    mode,
    notifyError,
    releaseLock,
    saveLatestDraft,
  ]);

  const requestMode = useCallback(
    async (nextMode: WikiEditorMode): Promise<boolean> => {
      if (nextMode === 'view') return prepareToLeave();

      if (mode !== 'view' && ownsLock) {
        changeMode(nextMode);
        return true;
      }

      return acquireLockForMode(nextMode);
    },
    [acquireLockForMode, changeMode, mode, ownsLock, prepareToLeave],
  );

  useEffect(() => {
    if (mode !== 'view') return;
    draftRef.current = canonicalContentMarkdown;
    setDraftState(canonicalContentMarkdown);
    setLastSaveOutcome((current) =>
      current === 'conflict' ? current : 'saved',
    );
  }, [canonicalContentMarkdown, document.id, mode]);

  useEffect(() => {
    if (!ownsLock || draft === canonicalContentMarkdown) return;

    const timer = setTimeout(() => {
      void saveLatestDraft();
    }, AUTO_SAVE_DELAY_MS);

    return () => clearTimeout(timer);
  }, [canonicalContentMarkdown, draft, ownsLock, saveLatestDraft]);

  useEffect(() => {
    if (!ownsLock || !latestLockState?.expiresAt) return;

    const remainingMs =
      new Date(latestLockState.expiresAt).getTime() - Date.now();
    const delay = Math.max(
      MIN_RENEW_DELAY_MS,
      Math.min(MAX_RENEW_DELAY_MS, Math.floor(remainingMs / 2)),
    );

    const timer = setTimeout(() => {
      void renewLock({ organizationId, documentId: document.id }).catch(
        () => undefined,
      );
    }, delay);

    return () => clearTimeout(timer);
  }, [
    document.id,
    latestLockState?.expiresAt,
    organizationId,
    ownsLock,
    renewLock,
  ]);

  useEffect(
    () => () => {
      if (modeRef.current === 'view') return;
      void wikiControllerReleaseEditLock(organizationId, document.id).catch(
        () => undefined,
      );
    },
    [document.id, organizationId],
  );

  const saveIndicator = useMemo<WikiSaveIndicator>(() => {
    if (acquirePending) {
      return { label: '잠금 확인 중…', tone: 'pending' };
    }
    if (
      (latestLockState?.locked && !latestLockState.ownedByActor) ||
      (mode !== 'view' && !ownsLock)
    ) {
      return { label: '편집 잠김', tone: 'locked' };
    }
    if (savePending) {
      return { label: '저장 중…', tone: 'pending' };
    }
    if (lastSaveOutcome === 'conflict') {
      return { label: '충돌본 저장됨', tone: 'warning' };
    }
    if (lastSaveOutcome === 'error' || saveError) {
      return { label: '저장 실패', tone: 'error' };
    }
    if (mode !== 'view' && draft !== canonicalContentMarkdown) {
      return { label: '변경됨', tone: 'warning' };
    }
    return { label: '저장됨', tone: 'saved' };
  }, [
    acquirePending,
    canonicalContentMarkdown,
    draft,
    lastSaveOutcome,
    latestLockState?.locked,
    latestLockState?.ownedByActor,
    mode,
    ownsLock,
    saveError,
    savePending,
  ]);

  return {
    draft,
    lockOwned: ownsLock,
    mode,
    modeChangePending: acquirePending,
    prepareToLeave,
    requestMode,
    saveIndicator,
    saveNow: saveLatestDraft,
    setDraft,
  };
}
