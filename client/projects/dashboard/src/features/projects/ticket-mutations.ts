import {
  getProjectsControllerGetTicketQueryKey,
  useProjectsControllerUpdateTicket,
  useTicketWorkflowControllerMoveTicket,
} from '@repo/client/api-client';
import type {
  MoveTicket,
  TicketDetail,
  UpdateTicket,
} from '@repo/client/api-client/schemas';
import { useMutationErrorNotification } from '@core/app/error/use-mutation-error-notification';
import {
  mergeTicketDetailUpdate,
  updateAffectsTicketSummary,
} from '@core/features/projects/lib/ticket-detail-cache';
import {
  invalidateProjectStats,
  invalidateTicketDetail,
  invalidateTicketSummary,
} from '@core/features/projects/ticket-cache-policy';
import type {
  MutationCallbacks,
  TicketMutationScope,
} from '@core/features/projects/ticket-mutation.types';

import { useQueryClient } from '@tanstack/react-query';

export function useTicketMutations(scope: TicketMutationScope) {
  const { organizationId, projectId, ticketId } = scope;
  const queryClient = useQueryClient();
  const notifyError = useMutationErrorNotification({
    id: 'ticket-detail-mutation-error',
    title: '이슈 변경을 저장하지 못했습니다',
    fallback: '잠시 후 다시 시도해 주세요.',
  });
  const updateTicketMutation = useProjectsControllerUpdateTicket({
    mutation: {
      onError: notifyError,
      onSuccess: (detail) => {
        queryClient.setQueryData<TicketDetail>(
          getProjectsControllerGetTicketQueryKey(
            organizationId,
            projectId,
            ticketId,
          ),
          (current) => mergeTicketDetailUpdate(current, detail),
        );
      },
      onSettled: async (_data, _error, variables) => {
        const invalidations: Promise<unknown>[] = [];
        if (updateAffectsTicketSummary(variables.data)) {
          invalidations.push(
            invalidateTicketSummary(queryClient, organizationId, projectId),
          );
        }
        if (variables.data.archived !== undefined) {
          invalidations.push(
            invalidateProjectStats(queryClient, organizationId, projectId),
          );
        }
        await Promise.all(invalidations);
      },
    },
  });
  const moveTicketMutation = useTicketWorkflowControllerMoveTicket({
    mutation: {
      onError: notifyError,
      onSettled: async () => {
        await Promise.all([
          invalidateTicketDetail(
            queryClient,
            organizationId,
            projectId,
            ticketId,
          ),
          invalidateTicketSummary(queryClient, organizationId, projectId),
          invalidateProjectStats(queryClient, organizationId, projectId),
        ]);
      },
    },
  });

  return {
    updateTicket: (data: UpdateTicket, callbacks?: MutationCallbacks) =>
      updateTicketMutation.mutate(
        { organizationId, projectId, ticketId, data },
        callbacks,
      ),
    moveTicket: (data: MoveTicket) =>
      moveTicketMutation.mutate({ organizationId, projectId, ticketId, data }),
    pending: updateTicketMutation.isPending || moveTicketMutation.isPending,
  };
}
