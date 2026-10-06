import {
  getProjectsControllerGetProjectQueryKey,
  getProjectsControllerGetTicketQueryKey,
  getProjectsControllerListProjectsQueryKey,
  getProjectsControllerListTicketsQueryKey,
  useProjectsControllerUpdateTicket,
  useTicketWorkflowControllerAddTicketChecklistItem,
  useTicketWorkflowControllerAttachTicketLabel,
  useTicketWorkflowControllerCreateTicketChecklist,
  useTicketWorkflowControllerCreateTicketComment,
  useTicketWorkflowControllerDetachTicketLabel,
  useTicketWorkflowControllerMoveTicket,
  useTicketWorkflowControllerMoveTicketChecklistItem,
  useTicketWorkflowControllerRemoveTicketChecklist,
  useTicketWorkflowControllerRemoveTicketChecklistItem,
  useTicketWorkflowControllerRemoveTicketComment,
  useTicketWorkflowControllerUpdateTicketChecklist,
  useTicketWorkflowControllerUpdateTicketChecklistItem,
  useTicketWorkflowControllerUpdateTicketComment,
} from '@repo/client/api-client';
import type {
  CreateTicketChecklist,
  CreateTicketChecklistItem,
  CreateTicketComment,
  MoveTicket,
  MoveTicketChecklistItem,
  TicketDetail,
  UpdateTicket,
  UpdateTicketChecklist,
  UpdateTicketChecklistItem,
  UpdateTicketComment,
} from '@repo/client/api-client/schemas';
import { useMutationErrorNotification } from '@core/app/error/use-mutation-error-notification';
import {
  mergeTicketDetailUpdate,
  updateAffectsTicketSummary,
} from '@core/features/projects/lib/ticket-detail-cache';

import { type QueryClient, useQueryClient } from '@tanstack/react-query';

type TicketDetailMutationScope = {
  organizationId: string;
  projectId: string;
  ticketId: string;
};

type MutationDone = () => void;
type MutationCallbacks = {
  onError?: MutationDone;
  onSuccess?: MutationDone;
};

export function useTicketDetailMutations(scope: TicketDetailMutationScope) {
  const { organizationId, projectId, ticketId } = scope;
  const queryClient = useQueryClient();
  const notifyError = useMutationErrorNotification({
    id: 'ticket-detail-mutation-error',
    title: '이슈 변경을 저장하지 못했습니다',
    fallback: '잠시 후 다시 시도해 주세요.',
  });
  const invalidateDetail = () =>
    invalidateTicketDetail(queryClient, organizationId, projectId, ticketId);
  const invalidateSummary = () =>
    invalidateTicketSummary(queryClient, organizationId, projectId);

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
          invalidations.push(invalidateSummary());
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
          invalidateDetail(),
          invalidateSummary(),
          invalidateProjectStats(queryClient, organizationId, projectId),
        ]);
      },
    },
  });
  const invalidateDetailAndSummary = () =>
    Promise.all([invalidateDetail(), invalidateSummary()]);
  const invalidateCommentCount = () =>
    Promise.all([invalidateDetail(), invalidateSummary()]);

  const attachLabelMutation = useTicketWorkflowControllerAttachTicketLabel({
    mutation: { onError: notifyError, onSettled: invalidateDetailAndSummary },
  });
  const detachLabelMutation = useTicketWorkflowControllerDetachTicketLabel({
    mutation: { onError: notifyError, onSettled: invalidateDetailAndSummary },
  });
  const createChecklistMutation =
    useTicketWorkflowControllerCreateTicketChecklist({
      mutation: { onError: notifyError, onSettled: invalidateDetail },
    });
  const updateChecklistMutation =
    useTicketWorkflowControllerUpdateTicketChecklist({
      mutation: { onError: notifyError, onSettled: invalidateDetail },
    });
  const removeChecklistMutation =
    useTicketWorkflowControllerRemoveTicketChecklist({
      mutation: { onError: notifyError, onSettled: invalidateDetailAndSummary },
    });
  const addChecklistItemMutation =
    useTicketWorkflowControllerAddTicketChecklistItem({
      mutation: { onError: notifyError, onSettled: invalidateDetailAndSummary },
    });
  const updateChecklistItemMutation =
    useTicketWorkflowControllerUpdateTicketChecklistItem({
      mutation: {
        onError: notifyError,
        onSettled: (_data, _error, variables) =>
          variables.data.completed === undefined
            ? invalidateDetail()
            : invalidateDetailAndSummary(),
      },
    });
  const moveChecklistItemMutation =
    useTicketWorkflowControllerMoveTicketChecklistItem({
      mutation: { onError: notifyError, onSettled: invalidateDetail },
    });
  const removeChecklistItemMutation =
    useTicketWorkflowControllerRemoveTicketChecklistItem({
      mutation: { onError: notifyError, onSettled: invalidateDetailAndSummary },
    });
  const createCommentMutation = useTicketWorkflowControllerCreateTicketComment({
    mutation: { onError: notifyError, onSettled: invalidateCommentCount },
  });
  const updateCommentMutation = useTicketWorkflowControllerUpdateTicketComment({
    mutation: { onError: notifyError, onSettled: invalidateDetail },
  });
  const removeCommentMutation = useTicketWorkflowControllerRemoveTicketComment({
    mutation: { onError: notifyError, onSettled: invalidateCommentCount },
  });

  return {
    updateTicket: (data: UpdateTicket, callbacks?: MutationCallbacks) =>
      updateTicketMutation.mutate(
        { organizationId, projectId, ticketId, data },
        callbacks,
      ),
    moveTicket: (data: MoveTicket) =>
      moveTicketMutation.mutate({ organizationId, projectId, ticketId, data }),
    attachLabel: (labelId: string) =>
      attachLabelMutation.mutate({
        organizationId,
        projectId,
        ticketId,
        labelId,
      }),
    detachLabel: (labelId: string) =>
      detachLabelMutation.mutate({
        organizationId,
        projectId,
        ticketId,
        labelId,
      }),
    createChecklist: (data: CreateTicketChecklist, onSuccess?: MutationDone) =>
      createChecklistMutation.mutate(
        { organizationId, projectId, ticketId, data },
        { onSuccess },
      ),
    updateChecklist: (
      checklistId: string,
      data: UpdateTicketChecklist,
      callbacks?: MutationCallbacks,
    ) =>
      updateChecklistMutation.mutate(
        {
          organizationId,
          projectId,
          ticketId,
          checklistId,
          data,
        },
        callbacks,
      ),
    removeChecklist: (checklistId: string) =>
      removeChecklistMutation.mutate({
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
      addChecklistItemMutation.mutate(
        {
          organizationId,
          projectId,
          ticketId,
          checklistId,
          data,
        },
        { onSuccess },
      ),
    updateChecklistItem: (
      checklistId: string,
      itemId: string,
      data: UpdateTicketChecklistItem,
      callbacks?: MutationCallbacks,
    ) =>
      updateChecklistItemMutation.mutate(
        {
          organizationId,
          projectId,
          ticketId,
          checklistId,
          itemId,
          data,
        },
        callbacks,
      ),
    moveChecklistItem: (
      checklistId: string,
      itemId: string,
      data: MoveTicketChecklistItem,
    ) =>
      moveChecklistItemMutation.mutate({
        organizationId,
        projectId,
        ticketId,
        checklistId,
        itemId,
        data,
      }),
    removeChecklistItem: (checklistId: string, itemId: string) =>
      removeChecklistItemMutation.mutate({
        organizationId,
        projectId,
        ticketId,
        checklistId,
        itemId,
      }),
    createComment: (data: CreateTicketComment, onSuccess?: MutationDone) =>
      createCommentMutation.mutate(
        { organizationId, projectId, ticketId, data },
        { onSuccess },
      ),
    updateComment: (
      commentId: string,
      data: UpdateTicketComment,
      onSuccess?: MutationDone,
    ) =>
      updateCommentMutation.mutate(
        {
          organizationId,
          projectId,
          ticketId,
          commentId,
          data,
        },
        { onSuccess },
      ),
    removeComment: (commentId: string) =>
      removeCommentMutation.mutate({
        organizationId,
        projectId,
        ticketId,
        commentId,
      }),
    ticketPending:
      updateTicketMutation.isPending || moveTicketMutation.isPending,
    labelPending:
      attachLabelMutation.isPending || detachLabelMutation.isPending,
    checklistPending:
      createChecklistMutation.isPending ||
      updateChecklistMutation.isPending ||
      removeChecklistMutation.isPending ||
      addChecklistItemMutation.isPending ||
      updateChecklistItemMutation.isPending ||
      moveChecklistItemMutation.isPending ||
      removeChecklistItemMutation.isPending,
    commentPending:
      createCommentMutation.isPending ||
      updateCommentMutation.isPending ||
      removeCommentMutation.isPending,
  };
}

function invalidateTicketDetail(
  queryClient: QueryClient,
  organizationId: string,
  projectId: string,
  ticketId: string,
) {
  return queryClient.invalidateQueries({
    queryKey: getProjectsControllerGetTicketQueryKey(
      organizationId,
      projectId,
      ticketId,
    ),
  });
}

function invalidateTicketSummary(
  queryClient: QueryClient,
  organizationId: string,
  projectId: string,
) {
  return queryClient.invalidateQueries({
    exact: false,
    queryKey: getProjectsControllerListTicketsQueryKey(
      organizationId,
      projectId,
    ),
  });
}

function invalidateProjectStats(
  queryClient: QueryClient,
  organizationId: string,
  projectId: string,
) {
  return Promise.all([
    queryClient.invalidateQueries({
      queryKey: getProjectsControllerGetProjectQueryKey(
        organizationId,
        projectId,
      ),
    }),
    queryClient.invalidateQueries({
      queryKey: getProjectsControllerListProjectsQueryKey(organizationId),
    }),
  ]);
}
