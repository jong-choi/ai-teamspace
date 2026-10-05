import type { PropsWithChildren } from 'react';

import * as api from '@repo/client/api-client';
import type {
  WikiDocument,
  WikiDocumentSaveResult,
  WikiEditLockState,
} from '@repo/client/api-client/schemas';
import {
  DashboardPlatformProvider,
  type DashboardPlatformValue,
} from '@core/app/platform/dashboard-platform';
import { useWikiEditSession } from '@core/features/wiki/use-wiki-edit-session';

import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import {
  QueryClient,
  QueryClientProvider,
  useMutation,
} from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react-native';

const organizationId = 'organization-a';
const documentId = '33333333-3333-4333-8333-333333333333';

type LockVariables = {
  documentId: string;
  organizationId: string;
};

type SaveVariables = LockVariables & {
  data: {
    baseRevision: number;
    contentMarkdown: string;
  };
};

type LockMutationMock = jest.Mock<
  (variables: LockVariables) => Promise<WikiEditLockState>
>;
type SaveMutationMock = jest.Mock<
  (variables: SaveVariables) => Promise<WikiDocumentSaveResult>
>;

const document: WikiDocument = {
  id: documentId,
  organizationId,
  folderId: null,
  title: '설계 문서',
  contentMarkdown: '# 초기 내용',
  revision: 1,
  createdByUserId: 'user-a',
  updatedByUserId: 'user-a',
  createdAt: '2026-10-05T00:00:00.000Z',
  updatedAt: '2026-10-05T00:00:00.000Z',
};

const ownedLock: WikiEditLockState = {
  locked: true,
  ownedByActor: true,
  lockedBy: 'user-a',
  acquiredAt: '2026-10-05T00:00:00.000Z',
  expiresAt: '2099-10-05T00:01:00.000Z',
};

function configureMutations(options?: {
  acquire?: LockMutationMock;
  release?: LockMutationMock;
  renew?: LockMutationMock;
  save?: SaveMutationMock;
}) {
  const acquire =
    options?.acquire ??
    jest.fn<(variables: LockVariables) => Promise<WikiEditLockState>>(
      async () => ownedLock,
    );
  const release =
    options?.release ??
    jest.fn<(variables: LockVariables) => Promise<WikiEditLockState>>(
      async () => ({ ...ownedLock, locked: false, ownedByActor: false }),
    );
  const renew =
    options?.renew ??
    jest.fn<(variables: LockVariables) => Promise<WikiEditLockState>>(
      async () => ownedLock,
    );
  const save =
    options?.save ??
    jest.fn<(variables: SaveVariables) => Promise<WikiDocumentSaveResult>>(
      async () => ({
        status: 'saved',
        conflictCopyCreated: false,
        document: { ...document, revision: 2 },
        conflictCopy: null,
      }),
    );

  jest
    .spyOn(api, 'useWikiControllerAcquireEditLock')
    .mockImplementation(function useAcquireLockMock() {
      return useMutation({ mutationFn: acquire }) as never;
    } as never);
  jest
    .spyOn(api, 'useWikiControllerRenewEditLock')
    .mockImplementation(function useRenewLockMock() {
      return useMutation({ mutationFn: renew }) as never;
    } as never);
  jest
    .spyOn(api, 'useWikiControllerReleaseEditLock')
    .mockImplementation(function useReleaseLockMock() {
      return useMutation({ mutationFn: release }) as never;
    } as never);
  jest
    .spyOn(api, 'useWikiControllerSaveDocumentContent')
    .mockImplementation(function useSaveDocumentMock() {
      return useMutation({ mutationFn: save }) as never;
    } as never);
  jest.spyOn(api, 'wikiControllerReleaseEditLock').mockResolvedValue({
    ...ownedLock,
    locked: false,
    ownedByActor: false,
  });

  return { acquire, release, renew, save };
}

function createWrapper(notifyError = jest.fn(), notifySuccess = jest.fn()) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { gcTime: Infinity, retry: false },
      mutations: { gcTime: Infinity, retry: false },
    },
  });
  const platform: DashboardPlatformValue = {
    currentUserId: 'user-a',
    sessionPending: false,
    copyText: jest.fn(async () => undefined),
    createAppUrl: (path) => path,
    exportMarkdown: jest.fn(async () => undefined),
    notifyError,
    notifySuccess,
  };

  function Wrapper({ children }: PropsWithChildren) {
    return (
      <QueryClientProvider client={queryClient}>
        <DashboardPlatformProvider value={platform}>
          {children}
        </DashboardPlatformProvider>
      </QueryClientProvider>
    );
  }

  return { Wrapper, notifyError, notifySuccess };
}

describe('위키 편집 세션', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it('다른 사용자가 lock을 가진 경우 편집 모드로 들어가지 않는다', async () => {
    const acquire = jest.fn<
      (variables: LockVariables) => Promise<WikiEditLockState>
    >(async () => ({
      ...ownedLock,
      ownedByActor: false,
      lockedBy: 'user-b',
    }));
    configureMutations({ acquire });
    const { Wrapper, notifyError } = createWrapper();
    const onConflictCopy = jest.fn<(nextDocument: WikiDocument) => void>();
    const { result } = await renderHook(
      () => useWikiEditSession({ document, onConflictCopy, organizationId }),
      { wrapper: Wrapper },
    );

    await act(async () => {
      expect(await result.current.requestMode('edit')).toBe(false);
    });

    expect(result.current.mode).toBe('view');
    expect(result.current.saveIndicator.label).toBe('편집 잠김');
    expect(notifyError).toHaveBeenCalledWith(
      expect.objectContaining({ description: '현재 편집자: user-b' }),
    );
  });

  it('저장 시 편집 시작 revision을 baseRevision으로 보낸다', async () => {
    const save = jest.fn<
      (variables: SaveVariables) => Promise<WikiDocumentSaveResult>
    >(async ({ data }) => ({
      status: 'saved',
      conflictCopyCreated: false,
      document: {
        ...document,
        contentMarkdown: data.contentMarkdown,
        revision: 2,
      },
      conflictCopy: null,
    }));
    configureMutations({ save });
    const { Wrapper } = createWrapper();
    const { result } = await renderHook(
      () =>
        useWikiEditSession({
          document,
          onConflictCopy: jest.fn<(nextDocument: WikiDocument) => void>(),
          organizationId,
        }),
      { wrapper: Wrapper },
    );

    await act(async () => {
      expect(await result.current.requestMode('edit')).toBe(true);
      result.current.setDraft('# 변경 내용');
    });
    await act(async () => {
      expect(await result.current.saveNow()).toBe('saved');
    });

    expect(save.mock.calls[0]?.[0]).toEqual({
      documentId,
      organizationId,
      data: {
        contentMarkdown: '# 변경 내용',
        baseRevision: 1,
      },
    });
    expect(result.current.saveIndicator.label).toBe('저장됨');
  });

  it('연속 저장은 Query cache의 최신 revision을 다음 baseRevision으로 사용한다', async () => {
    const save = jest.fn<
      (variables: SaveVariables) => Promise<WikiDocumentSaveResult>
    >(async ({ data }) => ({
      status: 'saved',
      conflictCopyCreated: false,
      document: {
        ...document,
        contentMarkdown: data.contentMarkdown,
        revision: data.baseRevision + 1,
      },
      conflictCopy: null,
    }));
    configureMutations({ save });
    const { Wrapper } = createWrapper();
    const { result } = await renderHook(
      () =>
        useWikiEditSession({
          document,
          onConflictCopy: jest.fn<(nextDocument: WikiDocument) => void>(),
          organizationId,
        }),
      { wrapper: Wrapper },
    );

    await act(async () => {
      await result.current.requestMode('edit');
      result.current.setDraft('# 첫 변경');
    });
    await act(async () => {
      await result.current.saveNow();
      result.current.setDraft('# 두 번째 변경');
    });
    await act(async () => {
      await result.current.saveNow();
    });

    expect(save.mock.calls[0]?.[0].data.baseRevision).toBe(1);
    expect(save.mock.calls[1]?.[0]).toEqual({
      documentId,
      organizationId,
      data: {
        contentMarkdown: '# 두 번째 변경',
        baseRevision: 2,
      },
    });
  });

  it('stale save가 conflict copy를 만들면 작성 내용을 새 문서로 연결한다', async () => {
    const conflictCopy: WikiDocument = {
      ...document,
      id: '44444444-4444-4444-8444-444444444444',
      title: '설계 문서 (01)',
      contentMarkdown: '# 내 변경 내용',
    };
    const save = jest.fn<
      (variables: SaveVariables) => Promise<WikiDocumentSaveResult>
    >(async () => ({
      status: 'conflict-copy-created',
      conflictCopyCreated: true,
      document: {
        ...document,
        contentMarkdown: '# 다른 사용자 변경',
        revision: 2,
      },
      conflictCopy,
    }));
    const { release } = configureMutations({ save });
    const { Wrapper, notifySuccess } = createWrapper();
    const onConflictCopy = jest.fn<(nextDocument: WikiDocument) => void>();
    const { result } = await renderHook(
      () => useWikiEditSession({ document, onConflictCopy, organizationId }),
      { wrapper: Wrapper },
    );

    await act(async () => {
      await result.current.requestMode('edit');
      result.current.setDraft('# 내 변경 내용');
    });
    await act(async () => {
      expect(await result.current.saveNow()).toBe('conflict');
    });

    expect(release.mock.calls[0]?.[0]).toEqual({ organizationId, documentId });
    expect(onConflictCopy).toHaveBeenCalledWith(conflictCopy);
    expect(notifySuccess).toHaveBeenCalledWith(
      expect.objectContaining({ title: '충돌본을 안전하게 저장했습니다' }),
    );
    expect(result.current.mode).toBe('view');
  });
});
