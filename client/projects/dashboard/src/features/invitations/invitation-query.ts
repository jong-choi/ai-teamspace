import { useInvitationsControllerGetDetailSuspense } from '@repo/client/api-client';

export function useInvitationDetail(invitationId: string) {
  return useInvitationsControllerGetDetailSuspense(invitationId);
}
