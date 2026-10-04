import { useOrganizationInvitationsControllerListSuspense } from '@repo/client/api-client';
import { OrganizationInvitationsControllerListParams } from '@repo/client/api-client/schemas';

export const ORGANIZATION_PENDING_INVITATIONS_PARAMS =
  OrganizationInvitationsControllerListParams.parse({
    status: 'pending',
    limit: 100,
    offset: 0,
  });

export function useOrganizationPendingInvitations(organizationId: string) {
  return useOrganizationInvitationsControllerListSuspense(
    organizationId,
    ORGANIZATION_PENDING_INVITATIONS_PARAMS,
  );
}

export function useOrganizationPendingInvitationTotal(organizationId: string) {
  return useOrganizationInvitationsControllerListSuspense<number>(
    organizationId,
    ORGANIZATION_PENDING_INVITATIONS_PARAMS,
    {
      query: {
        select: (response) => response.total,
      },
    },
  );
}
