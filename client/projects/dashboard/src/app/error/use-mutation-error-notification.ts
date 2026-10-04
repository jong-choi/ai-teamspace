import { useCallback } from 'react';

import { getProblemDetails } from '@monorepo-erp/api-client/runtime';
import { useDashboardPlatform } from '@core/app/platform/dashboard-platform';

type MutationErrorNotificationOptions = {
  fallback: string;
  id?: string;
  title: string;
};

export function useMutationErrorNotification({
  fallback,
  id,
  title,
}: MutationErrorNotificationOptions): (error: unknown) => void {
  const { notifyError } = useDashboardPlatform();

  return useCallback(
    (error: unknown) => {
      const problem = getProblemDetails(error);
      notifyError({
        id,
        title,
        description: problem?.detail ?? problem?.title ?? fallback,
      });
    },
    [fallback, id, notifyError, title],
  );
}
