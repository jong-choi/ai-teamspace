import {
  getInvitationsControllerGetDetailQueryKey,
  getOrganizationInvitationsControllerListQueryKey,
  getOrganizationsControllerGetActiveQueryKey,
  getOrganizationsControllerGetDetailQueryKey,
  getOrganizationsControllerListMembersQueryKey,
  getOrganizationsControllerListQueryKey,
  useInvitationsControllerAccept,
  useInvitationsControllerReject,
} from '@repo/client/api-client';
import type { OrganizationInvitationDetail } from '@repo/client/api-client/schemas';
import { useDashboardPlatform } from '@core/app/platform/dashboard-platform';
import { mergeInvitationResultIntoDetail } from '@core/features/invitations/invitation-model';

import { type QueryClient, useQueryClient } from '@tanstack/react-query';

export function useInvitationMutations(detail: OrganizationInvitationDetail) {
  const queryClient = useQueryClient();
  const { notifyError, notifySuccess } = useDashboardPlatform();
  const acceptMutation = useInvitationsControllerAccept({
    mutation: {
      onError: () => {
        notifyError({
          id: 'organization-invitation-accept-error',
          title: '초대를 수락하지 못했습니다',
        });
      },
      onSuccess: async (result) => {
        setInvitationDetailResult(queryClient, detail, result);
        await invalidateAcceptedInvitationQueries(
          queryClient,
          detail.organization.id,
        );
        notifySuccess({
          id: 'organization-invitation-accept-success',
          title: '조직 초대를 수락했습니다',
        });
      },
    },
  });
  const rejectMutation = useInvitationsControllerReject({
    mutation: {
      onError: () => {
        notifyError({
          id: 'organization-invitation-reject-error',
          title: '초대를 거절하지 못했습니다',
        });
      },
      onSuccess: async (result) => {
        setInvitationDetailResult(queryClient, detail, result);
        await invalidateOrganizationInvitationList(
          queryClient,
          detail.organization.id,
        );
        notifySuccess({
          id: 'organization-invitation-reject-success',
          title: '조직 초대를 거절했습니다',
        });
      },
    },
  });

  return {
    accept: (onSuccess?: () => void) => {
      acceptMutation.mutate(
        { invitationId: detail.id },
        onSuccess ? { onSuccess } : undefined,
      );
    },
    accepting: acceptMutation.isPending,
    reject: () => {
      rejectMutation.mutate({ invitationId: detail.id });
    },
    rejecting: rejectMutation.isPending,
  };
}

function setInvitationDetailResult(
  queryClient: QueryClient,
  detail: OrganizationInvitationDetail,
  result: Parameters<typeof mergeInvitationResultIntoDetail>[1],
) {
  queryClient.setQueryData(
    getInvitationsControllerGetDetailQueryKey(detail.id),
    mergeInvitationResultIntoDetail(detail, result),
  );
}

async function invalidateAcceptedInvitationQueries(
  queryClient: QueryClient,
  organizationId: string,
) {
  await Promise.all([
    queryClient.invalidateQueries({
      queryKey: getOrganizationsControllerListQueryKey(),
    }),
    queryClient.invalidateQueries({
      queryKey: getOrganizationsControllerGetActiveQueryKey(),
    }),
    queryClient.invalidateQueries({
      queryKey: getOrganizationsControllerGetDetailQueryKey(organizationId),
    }),
    queryClient.invalidateQueries({
      exact: false,
      queryKey: getOrganizationsControllerListMembersQueryKey(organizationId),
    }),
    invalidateOrganizationInvitationList(queryClient, organizationId),
  ]);
}

function invalidateOrganizationInvitationList(
  queryClient: QueryClient,
  organizationId: string,
) {
  return queryClient.invalidateQueries({
    exact: false,
    queryKey: getOrganizationInvitationsControllerListQueryKey(organizationId),
  });
}
