import type { OrganizationInvitationMutationReceiptOutput } from '@repo/client/api-client/schemas';
import { invalidateOrganizationInvitationQueries } from '@core/features/organizations/organization-invitation-mutations';

import type { QueryClient } from '@tanstack/react-query';

// Agent가 초대를 만들었을 때 초대 목록을 다시 불러온다.
export async function applyOrganizationInvitationAgentMutation(
  queryClient: QueryClient,
  receipt: OrganizationInvitationMutationReceiptOutput,
): Promise<void> {
  await invalidateOrganizationInvitationQueries(
    queryClient,
    receipt.organizationId,
  );
}
