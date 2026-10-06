import {
  useTicketWorkflowControllerAddTicketChecklistItem,
  useTicketWorkflowControllerCreateTicketChecklist,
  useTicketWorkflowControllerMoveTicketChecklistItem,
  useTicketWorkflowControllerRemoveTicketChecklist,
  useTicketWorkflowControllerRemoveTicketChecklistItem,
  useTicketWorkflowControllerUpdateTicketChecklist,
  useTicketWorkflowControllerUpdateTicketChecklistItem,
} from '@repo/client/api-client';
import type {
  CreateTicketChecklist,
  CreateTicketChecklistItem,
  MoveTicketChecklistItem,
  UpdateTicketChecklist,
  UpdateTicketChecklistItem,
} from '@repo/client/api-client/schemas';
import { useMutationErrorNotification } from '@core/app/error/use-mutation-error-notification';
import {
  invalidateTicketDetail,
  invalidateTicketSummary,
} from '@core/features/projects/ticket-cache-policy';
import type {
  MutationCallbacks,
  MutationDone,
  TicketMutationScope,
} from '@core/features/projects/ticket-mutation.types';

import { useQueryClient } from '@tanstack/react-query';

export function useTicketChecklistMutations(scope: TicketMutationScope) {
  const { organizationId, projectId, ticketId } = scope;
  const queryClient = useQueryClient();
  const notifyError = useMutationErrorNotification({
    id: 'ticket-detail-mutation-error',
    title: '이슈 변경을 저장하지 못했습니다',
    fallback: '잠시 후 다시 시도해 주세요.',
  });
  const invalidateDetail = () =>
    invalidateTicketDetail(queryClient, organizationId, projectId, ticketId);
  const invalidateDetailAndSummary = () =>
    Promise.all([
      invalidateDetail(),
      invalidateTicketSummary(queryClient, organizationId, projectId),
    ]);
  const createMutation = useTicketWorkflowControllerCreateTicketChecklist({
    mutation: { onError: notifyError, onSettled: invalidateDetail },
  });
  const updateMutation = useTicketWorkflowControllerUpdateTicketChecklist({
    mutation: { onError: notifyError, onSettled: invalidateDetail },
  });
  const removeMutation = useTicketWorkflowControllerRemoveTicketChecklist({
    mutation: { onError: notifyError, onSettled: invalidateDetailAndSummary },
  });
  const addItemMutation = useTicketWorkflowControllerAddTicketChecklistItem({
    mutation: {
      onError: notifyError,
      onSettled: invalidateDetailAndSummary,
    },
  });
  const updateItemMutation =
    useTicketWorkflowControllerUpdateTicketChecklistItem({
      mutation: {
        onError: notifyError,
        onSettled: (_data, _error, variables) =>
          variables.data.completed === undefined
            ? invalidateDetail()
            : invalidateDetailAndSummary(),
      },
    });
  const moveItemMutation = useTicketWorkflowControllerMoveTicketChecklistItem({
    mutation: { onError: notifyError, onSettled: invalidateDetail },
  });
  const removeItemMutation =
    useTicketWorkflowControllerRemoveTicketChecklistItem({
      mutation: {
        onError: notifyError,
        onSettled: invalidateDetailAndSummary,
      },
    });

  return {
    createChecklist: (data: CreateTicketChecklist, onSuccess?: MutationDone) =>
      createMutation.mutate(
        { organizationId, projectId, ticketId, data },
        { onSuccess },
      ),
    updateChecklist: (
      checklistId: string,
      data: UpdateTicketChecklist,
      callbacks?: MutationCallbacks,
    ) =>
      updateMutation.mutate(
        { organizationId, projectId, ticketId, checklistId, data },
        callbacks,
      ),
    removeChecklist: (checklistId: string) =>
      removeMutation.mutate({
        organizationId,
        projectId,
        ticketId,
        checklistId,
      }),
    addChecklistItem: (
      checklistId: string,
      data: CreateTicketChecklistItem,
      onSuccess?: MutationDone,
    ) =>
      addItemMutation.mutate(
        { organizationId, projectId, ticketId, checklistId, data },
        { onSuccess },
      ),
    updateChecklistItem: (
      checklistId: string,
      itemId: string,
      data: UpdateTicketChecklistItem,
      callbacks?: MutationCallbacks,
    ) =>
      updateItemMutation.mutate(
        { organizationId, projectId, ticketId, checklistId, itemId, data },
        callbacks,
      ),
    moveChecklistItem: (
      checklistId: string,
      itemId: string,
      data: MoveTicketChecklistItem,
    ) =>
      moveItemMutation.mutate({
        organizationId,
        projectId,
        ticketId,
        checklistId,
        itemId,
        data,
      }),
    removeChecklistItem: (checklistId: string, itemId: string) =>
      removeItemMutation.mutate({
        organizationId,
        projectId,
        ticketId,
        checklistId,
        itemId,
      }),
    pending:
      createMutation.isPending ||
      updateMutation.isPending ||
      removeMutation.isPending ||
      addItemMutation.isPending ||
      updateItemMutation.isPending ||
      moveItemMutation.isPending ||
      removeItemMutation.isPending,
  };
}
