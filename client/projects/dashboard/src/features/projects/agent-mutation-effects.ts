import type { ProjectTicketMutationReceiptOutput } from '@repo/client/api-client/schemas';
import {
  invalidateProjectStats,
  invalidateTicketDetail,
  invalidateTicketSummary,
} from '@core/features/projects/ticket-cache-policy';

import type { QueryClient } from '@tanstack/react-query';

// Agent가 티켓을 만들거나 바꾸거나 옮겼을 때 보드, 상세, 프로젝트 통계를 다시 불러온다.
export async function applyProjectTicketAgentMutation(
  queryClient: QueryClient,
  receipt: ProjectTicketMutationReceiptOutput,
): Promise<void> {
  await Promise.all([
    invalidateTicketSummary(
      queryClient,
      receipt.organizationId,
      receipt.projectId,
    ),
    invalidateTicketDetail(
      queryClient,
      receipt.organizationId,
      receipt.projectId,
      receipt.resourceId,
    ),
    invalidateProjectStats(
      queryClient,
      receipt.organizationId,
      receipt.projectId,
    ),
  ]);
}
