import {
  useMcpAccessControllerUpdateMyPolicy,
  useMcpAccessControllerUpdateOrganizationPolicy,
} from '@repo/client/api-client';
import { getProblemDetails } from '@repo/client/api-client/runtime';
import { useDashboardPlatform } from '@core/app/platform/dashboard-platform';
import { getMcpAccessQueryKey } from '@core/features/mcp-access/mcp-access-query';

import { useQueryClient } from '@tanstack/react-query';

export function isMcpPolicyRevisionConflict(error: unknown): boolean {
  return getProblemDetails(error)?.errorCode === 'MCP_POLICY_REVISION_CONFLICT';
}

export function useMcpAccessMutations(organizationId: string) {
  const queryClient = useQueryClient();
  const { notifyError, notifySuccess } = useDashboardPlatform();
  const queryKey = getMcpAccessQueryKey(organizationId);

  const updateMyPolicy = useMcpAccessControllerUpdateMyPolicy({
    mutation: {
      onSuccess: (result) => {
        queryClient.setQueryData(queryKey, result);
        notifySuccess({ title: '내 권한을 저장했습니다.' });
      },
    },
  });

  const updateOrganizationPolicy =
    useMcpAccessControllerUpdateOrganizationPolicy({
      mutation: {
        onSuccess: (result) => {
          queryClient.setQueryData(queryKey, result);
          notifySuccess({ title: '조직 정책을 저장했습니다.' });
        },
      },
    });

  const handleError = async (
    error: unknown,
    fallback: string,
  ): Promise<'revision_conflict' | 'error'> => {
    if (isMcpPolicyRevisionConflict(error)) {
      await queryClient.invalidateQueries({ queryKey });
      notifyError({
        id: 'mcp-policy-revision-conflict',
        title: '다른 변경이 먼저 저장되었습니다',
        description:
          '최신 정책을 다시 불러왔습니다. 작성 중인 선택은 유지했으니 내용을 확인하고 다시 저장해 주세요.',
      });
      return 'revision_conflict';
    }

    const problem = getProblemDetails(error);
    notifyError({
      id: 'mcp-access-update-error',
      title: '권한을 저장하지 못했습니다',
      description: problem?.detail ?? fallback,
    });
    return 'error';
  };

  return {
    updateMyPolicy,
    updateOrganizationPolicy,
    handleError,
  };
}
