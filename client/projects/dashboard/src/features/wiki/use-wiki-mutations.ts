import { useCallback } from 'react';

import {
  getWikiControllerGetDocumentQueryKey,
  getWikiControllerGetTreeQueryKey,
  useWikiControllerCreateDocument,
  useWikiControllerDeleteDocument,
  useWikiControllerUpdateDocument,
} from '@repo/client/api-client';
import type {
  CreateWikiDocument,
  UpdateWikiDocument,
} from '@repo/client/api-client/schemas';
import { useMutationErrorNotification } from '@core/app/error/use-mutation-error-notification';
import { useDashboardPlatform } from '@core/app/platform/dashboard-platform';

import { type QueryClient, useQueryClient } from '@tanstack/react-query';

export function invalidateWikiTree(
  queryClient: QueryClient,
  organizationId: string,
) {
  return queryClient.invalidateQueries({
    queryKey: getWikiControllerGetTreeQueryKey(organizationId),
  });
}

export function invalidateWikiDocument(
  queryClient: QueryClient,
  organizationId: string,
  documentId: string,
) {
  return queryClient.invalidateQueries({
    queryKey: getWikiControllerGetDocumentQueryKey(organizationId, documentId),
  });
}

export function useWikiMutations(organizationId: string) {
  const queryClient = useQueryClient();
  const { notifySuccess } = useDashboardPlatform();
  const notifyError = useMutationErrorNotification({
    id: 'wiki-mutation',
    title: '위키를 변경하지 못했습니다',
    fallback: '잠시 후 다시 시도해 주세요.',
  });
  const createDocumentMutation = useWikiControllerCreateDocument({
    mutation: { onError: notifyError },
  });
  const updateDocumentMutation = useWikiControllerUpdateDocument({
    mutation: { onError: notifyError },
  });
  const deleteDocumentMutation = useWikiControllerDeleteDocument({
    mutation: { onError: notifyError },
  });

  const invalidateTree = useCallback(
    () => invalidateWikiTree(queryClient, organizationId),
    [organizationId, queryClient],
  );

  const invalidateDocument = useCallback(
    (documentId: string) =>
      invalidateWikiDocument(queryClient, organizationId, documentId),
    [organizationId, queryClient],
  );

  return {
    pending:
      createDocumentMutation.isPending ||
      updateDocumentMutation.isPending ||
      deleteDocumentMutation.isPending,
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
