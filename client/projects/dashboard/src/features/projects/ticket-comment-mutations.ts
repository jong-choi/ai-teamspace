import {
  useTicketWorkflowControllerCreateTicketComment,
  useTicketWorkflowControllerRemoveTicketComment,
  useTicketWorkflowControllerUpdateTicketComment,
} from '@repo/client/api-client';
import type {
  CreateTicketComment,
  UpdateTicketComment,
} from '@repo/client/api-client/schemas';
import { useMutationErrorNotification } from '@core/app/error/use-mutation-error-notification';
import {
  invalidateTicketDetail,
  invalidateTicketSummary,
} from '@core/features/projects/ticket-cache-policy';
import type {
  MutationDone,
  TicketMutationScope,
} from '@core/features/projects/ticket-mutation.types';

import { useQueryClient } from '@tanstack/react-query';

export function useTicketCommentMutations(scope: TicketMutationScope) {
  const { organizationId, projectId, ticketId } = scope;
  const queryClient = useQueryClient();
  const notifyError = useMutationErrorNotification({
    id: 'ticket-detail-mutation-error',
    title: '이슈 변경을 저장하지 못했습니다',
    fallback: '잠시 후 다시 시도해 주세요.',
  });
  const invalidateDetail = () =>
    invalidateTicketDetail(queryClient, organizationId, projectId, ticketId);
  const invalidateCount = () =>
    Promise.all([
      invalidateDetail(),
      invalidateTicketSummary(queryClient, organizationId, projectId),
    ]);
  const createMutation = useTicketWorkflowControllerCreateTicketComment({
    mutation: { onError: notifyError, onSettled: invalidateCount },
  });
  const updateMutation = useTicketWorkflowControllerUpdateTicketComment({
    mutation: { onError: notifyError, onSettled: invalidateDetail },
  });
  const removeMutation = useTicketWorkflowControllerRemoveTicketComment({
    mutation: { onError: notifyError, onSettled: invalidateCount },
  });

  return {
    createComment: (data: CreateTicketComment, onSuccess?: MutationDone) =>
      createMutation.mutate(
        { organizationId, projectId, ticketId, data },
        { onSuccess },
      ),
    updateComment: (
      commentId: string,
      data: UpdateTicketComment,
      onSuccess?: MutationDone,
    ) =>
      updateMutation.mutate(
        { organizationId, projectId, ticketId, commentId, data },
        { onSuccess },
      ),
    removeComment: (commentId: string) =>
      removeMutation.mutate({
        organizationId,
        projectId,
        ticketId,
        commentId,
      }),
    pending:
      createMutation.isPending ||
      updateMutation.isPending ||
      removeMutation.isPending,
  };
}
