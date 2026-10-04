import {
  getOrganizationInvitationsControllerListQueryKey,
  useOrganizationInvitationsControllerCancel,
  useOrganizationInvitationsControllerCreate,
  useOrganizationInvitationsControllerResend,
} from '@repo/client/api-client';
import type { OrganizationInvitationsControllerCreateBody } from '@repo/client/api-client/schemas';
import { useDashboardPlatform } from '@core/app/platform/dashboard-platform';

import { type QueryClient, useQueryClient } from '@tanstack/react-query';

export function useOrganizationInvitationMutations(organizationId: string) {
  const queryClient = useQueryClient();
  const { notifyError, notifySuccess } = useDashboardPlatform();
  const createMutation = useOrganizationInvitationsControllerCreate({
    mutation: {
      onError: () => {
        notifyError({
          id: 'organization-invitation-create-error',
          title: '초대를 보내지 못했습니다',
        });
      },
      onSuccess: async () => {
        await invalidateOrganizationInvitationQueries(
          queryClient,
          organizationId,
        );
        notifySuccess({
          id: 'organization-invitation-create-success',
          title: '초대를 보냈습니다',
        });
      },
    },
  });
  const cancelMutation = useOrganizationInvitationsControllerCancel({
    mutation: {
      onError: () => {
        notifyError({
          id: 'organization-invitation-cancel-error',
          title: '초대를 취소하지 못했습니다',
        });
      },
      onSuccess: async () => {
        await invalidateOrganizationInvitationQueries(
          queryClient,
          organizationId,
        );
        notifySuccess({
          id: 'organization-invitation-cancel-success',
          title: '초대를 취소했습니다',
        });
      },
    },
  });
  const resendMutation = useOrganizationInvitationsControllerResend({
    mutation: {
      onError: () => {
        notifyError({
          id: 'organization-invitation-resend-error',
          title: '초대를 다시 보내지 못했습니다',
        });
      },
      onSuccess: async () => {
        await invalidateOrganizationInvitationQueries(
          queryClient,
          organizationId,
        );
        notifySuccess({
          id: 'organization-invitation-resend-success',
          title: '초대를 다시 보냈습니다',
        });
      },
    },
  });

  return {
    cancel: (invitationId: string, onSuccess?: () => void) => {
      cancelMutation.mutate(
        { organizationId, invitationId },
        onSuccess ? { onSuccess } : undefined,
      );
    },
    cancelingInvitationId: cancelMutation.isPending
      ? cancelMutation.variables?.invitationId
      : undefined,
    create: (
      data: OrganizationInvitationsControllerCreateBody,
      onSuccess?: () => void,
    ) => {
      createMutation.mutate(
        { organizationId, data },
        onSuccess ? { onSuccess } : undefined,
      );
    },
    creating: createMutation.isPending,
    resend: (invitationId: string) => {
      resendMutation.mutate({ organizationId, invitationId });
    },
    resendingInvitationId: resendMutation.isPending
      ? resendMutation.variables?.invitationId
      : undefined,
  };
}

function invalidateOrganizationInvitationQueries(
  queryClient: QueryClient,
  organizationId: string,
) {
  return queryClient.invalidateQueries({
    exact: false,
    queryKey: getOrganizationInvitationsControllerListQueryKey(organizationId),
  });
}
