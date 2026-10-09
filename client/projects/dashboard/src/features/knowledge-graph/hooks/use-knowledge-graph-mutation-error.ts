import { useCallback } from 'react';

import {
  type ErrorType,
  getProblemDetails,
} from '@repo/client/api-client/runtime';
import type { ProblemDetails } from '@repo/client/api-client/schemas';
import { useMutationErrorNotification } from '@core/app/error/use-mutation-error-notification';
import { useGraphStudioStore } from '@core/features/knowledge-graph/state/graph-studio-provider';

import { useQueryClient } from '@tanstack/react-query';

type GraphMutationErrorOptions = {
  fallback: string;
  id: string;
  title: string;
};

/** 권한 상실 뒤에는 열린 편집기와 조직 범위 KG cache를 즉시 폐기한다. */
export function useKnowledgeGraphMutationError({
  fallback,
  id,
  title,
}: GraphMutationErrorOptions) {
  const queryClient = useQueryClient();
  const clearSelection = useGraphStudioStore((state) => state.clearSelection);
  const closeDialog = useGraphStudioStore((state) => state.closeDialog);
  const notifyError = useMutationErrorNotification({ fallback, id, title });

  return useCallback(
    (error: ErrorType<ProblemDetails>) => {
      const problem = getProblemDetails(error);
      if (isGraphAccessLoss(problem)) {
        closeDialog();
        clearSelection();
        queryClient.removeQueries({
          predicate: ({ queryKey }) =>
            String(queryKey[0]).includes('/knowledge-graph'),
        });
      }
      notifyError(error);
    },
    [clearSelection, closeDialog, notifyError, queryClient],
  );
}

export function isGraphAccessLoss(problem: ProblemDetails | null): boolean {
  return Boolean(
    problem &&
    (problem.status === 403 ||
      problem.status === 404 ||
      problem.errorCode === 'KG_AUTHORIZATION_UNAVAILABLE'),
  );
}
