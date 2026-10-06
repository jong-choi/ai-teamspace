import {
  useTicketWorkflowControllerAttachTicketLabel,
  useTicketWorkflowControllerDetachTicketLabel,
} from '@repo/client/api-client';
import { useMutationErrorNotification } from '@core/app/error/use-mutation-error-notification';
import {
  invalidateTicketDetail,
  invalidateTicketSummary,
} from '@core/features/projects/ticket-cache-policy';
import type { TicketMutationScope } from '@core/features/projects/ticket-mutation.types';

import { useQueryClient } from '@tanstack/react-query';

export function useTicketLabelMutations(scope: TicketMutationScope) {
  const { organizationId, projectId, ticketId } = scope;
  const queryClient = useQueryClient();
  const notifyError = useMutationErrorNotification({
    id: 'ticket-detail-mutation-error',
    title: '이슈 변경을 저장하지 못했습니다',
    fallback: '잠시 후 다시 시도해 주세요.',
  });
  const invalidate = () =>
    Promise.all([
      invalidateTicketDetail(queryClient, organizationId, projectId, ticketId),
      invalidateTicketSummary(queryClient, organizationId, projectId),
    ]);
  const attachMutation = useTicketWorkflowControllerAttachTicketLabel({
    mutation: { onError: notifyError, onSettled: invalidate },
  });
  const detachMutation = useTicketWorkflowControllerDetachTicketLabel({
    mutation: { onError: notifyError, onSettled: invalidate },
  });

  return {
    attachLabel: (labelId: string) =>
      attachMutation.mutate({ organizationId, projectId, ticketId, labelId }),
    detachLabel: (labelId: string) =>
      detachMutation.mutate({ organizationId, projectId, ticketId, labelId }),
    pending: attachMutation.isPending || detachMutation.isPending,
  };
}
