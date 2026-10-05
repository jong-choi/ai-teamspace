import { useCallback } from 'react';

import {
  getWikiControllerGetDocumentQueryKey,
  getWikiControllerGetTreeQueryKey,
  useWikiControllerCreateDocument,
  useWikiControllerCreateFolder,
  useWikiControllerDeleteDocument,
  useWikiControllerDeleteFolder,
  useWikiControllerUpdateDocument,
  useWikiControllerUpdateFolder,
} from '@repo/client/api-client';
import type {
  CreateWikiDocument,
  CreateWikiFolder,
  UpdateWikiDocument,
  UpdateWikiFolder,
} from '@repo/client/api-client/schemas';
import { useMutationErrorNotification } from '@core/app/error/use-mutation-error-notification';
import { useDashboardPlatform } from '@core/app/platform/dashboard-platform';

import { useQueryClient } from '@tanstack/react-query';

export function useWikiMutations(organizationId: string) {
  const queryClient = useQueryClient();
  const { notifySuccess } = useDashboardPlatform();
  const notifyError = useMutationErrorNotification({
    id: 'wiki-mutation',
    title: '위키를 변경하지 못했습니다',
    fallback: '잠시 후 다시 시도해 주세요.',
  });
  const createFolderMutation = useWikiControllerCreateFolder({
    mutation: { onError: notifyError },
  });
  const createDocumentMutation = useWikiControllerCreateDocument({
    mutation: { onError: notifyError },
  });
  const updateFolderMutation = useWikiControllerUpdateFolder({
    mutation: { onError: notifyError },
  });
  const updateDocumentMutation = useWikiControllerUpdateDocument({
    mutation: { onError: notifyError },
  });
  const deleteFolderMutation = useWikiControllerDeleteFolder({
    mutation: { onError: notifyError },
  });
  const deleteDocumentMutation = useWikiControllerDeleteDocument({
    mutation: { onError: notifyError },
  });

  const invalidateTree = useCallback(
    () =>
      queryClient.invalidateQueries({
        queryKey: getWikiControllerGetTreeQueryKey(organizationId),
      }),
    [organizationId, queryClient],
  );

  const invalidateDocument = useCallback(
    (documentId: string) =>
      queryClient.invalidateQueries({
        queryKey: getWikiControllerGetDocumentQueryKey(
          organizationId,
          documentId,
        ),
      }),
    [organizationId, queryClient],
  );

  return {
    pending:
      createFolderMutation.isPending ||
      createDocumentMutation.isPending ||
      updateFolderMutation.isPending ||
      updateDocumentMutation.isPending ||
      deleteFolderMutation.isPending ||
      deleteDocumentMutation.isPending,
    createFolder: async (data: CreateWikiFolder) => {
      const folder = await createFolderMutation.mutateAsync({
        organizationId,
        data,
      });
      await invalidateTree();
      notifySuccess({
        title: '폴더를 만들었습니다',
        description: folder.name,
      });
      return folder;
    },
    createDocument: async (data: CreateWikiDocument) => {
      const document = await createDocumentMutation.mutateAsync({
        organizationId,
        data,
      });
      await invalidateTree();
      notifySuccess({
        title: '문서를 만들었습니다',
        description: document.title,
      });
      return document;
    },
    updateFolder: async (folderId: string, data: UpdateWikiFolder) => {
      const folder = await updateFolderMutation.mutateAsync({
        organizationId,
        folderId,
        data,
      });
      await invalidateTree();
      notifySuccess({
        title: '폴더를 변경했습니다',
        description: folder.name,
      });
      return folder;
    },
    updateDocument: async (documentId: string, data: UpdateWikiDocument) => {
      const document = await updateDocumentMutation.mutateAsync({
        organizationId,
        documentId,
        data,
      });
      await Promise.all([invalidateTree(), invalidateDocument(documentId)]);
      notifySuccess({
        title: '문서를 변경했습니다',
        description: document.title,
      });
      return document;
    },
    deleteFolder: async (folderId: string) => {
      await deleteFolderMutation.mutateAsync({ organizationId, folderId });
      await invalidateTree();
      notifySuccess({ title: '폴더를 삭제했습니다' });
    },
    deleteDocument: async (documentId: string) => {
      await deleteDocumentMutation.mutateAsync({ organizationId, documentId });
      await invalidateTree();
      queryClient.removeQueries({
        queryKey: getWikiControllerGetDocumentQueryKey(
          organizationId,
          documentId,
        ),
      });
      notifySuccess({ title: '문서를 삭제했습니다' });
    },
  };
}
