import {
  getOrganizationsControllerListMembersQueryKey,
  useOrganizationsControllerChangeMemberRole,
  useOrganizationsControllerRemoveMember,
} from '@repo/client/api-client';
import { OrganizationsControllerChangeMemberRoleBody } from '@repo/client/api-client/schemas';
import { useMutationErrorNotification } from '@core/app/error/use-mutation-error-notification';
import { useDashboardPlatform } from '@core/app/platform/dashboard-platform';
import type { OrganizationMemberRole } from '@core/features/organizations/organization-member-model';

import { type QueryClient, useQueryClient } from '@tanstack/react-query';

export function useOrganizationMemberMutations(organizationId: string) {
  const queryClient = useQueryClient();
  const { notifySuccess } = useDashboardPlatform();
  const notifyRoleError = useMutationErrorNotification({
    id: 'organization-member-role-error',
    title: '역할을 변경하지 못했습니다',
    fallback: '권한과 조직 상태를 확인한 뒤 다시 시도해 주세요.',
  });
  const notifyRemoveError = useMutationErrorNotification({
    id: 'organization-member-remove-error',
    title: '멤버를 제거하지 못했습니다',
    fallback: '권한과 조직 상태를 확인한 뒤 다시 시도해 주세요.',
  });
  const changeRoleMutation = useOrganizationsControllerChangeMemberRole({
    mutation: {
      onError: notifyRoleError,
      onSuccess: async () => {
        await invalidateOrganizationMemberQueries(queryClient, organizationId);
        notifySuccess({
          id: 'organization-member-role-success',
          title: '역할을 변경했습니다',
        });
      },
    },
  });
  const removeMemberMutation = useOrganizationsControllerRemoveMember({
    mutation: {
      onError: notifyRemoveError,
      onSuccess: async () => {
        await invalidateOrganizationMemberQueries(queryClient, organizationId);
        notifySuccess({
          id: 'organization-member-remove-success',
          title: '멤버를 제거했습니다',
        });
      },
    },
  });

  return {
    changeRole: (memberId: string, role: OrganizationMemberRole) => {
      changeRoleMutation.mutate({
        organizationId,
        memberId,
        data: OrganizationsControllerChangeMemberRoleBody.parse({ role }),
      });
    },
    isPending: changeRoleMutation.isPending || removeMemberMutation.isPending,
    removeMember: (memberId: string, onSuccess: () => void) => {
      removeMemberMutation.mutate(
        {
          organizationId,
          memberId,
        },
        { onSuccess },
      );
    },
  };
}

function invalidateOrganizationMemberQueries(
  queryClient: QueryClient,
  organizationId: string,
) {
  return queryClient.invalidateQueries({
    exact: false,
    queryKey: getOrganizationsControllerListMembersQueryKey(organizationId),
  });
}
