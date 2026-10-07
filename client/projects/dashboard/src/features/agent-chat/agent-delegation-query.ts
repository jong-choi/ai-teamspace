import {
  getMcpAgentDelegationControllerStatusQueryKey,
  useMcpAgentDelegationControllerRevoke,
  useMcpAgentDelegationControllerStart,
  useMcpAgentDelegationControllerStatusSuspense,
} from '@repo/client/api-client';
import type { McpAgentDelegationStatus } from '@repo/client/api-client/schemas';

import { useQueryClient } from '@tanstack/react-query';

export function getAgentDelegationQueryKey(
  userId: string,
  organizationId: string,
) {
  return [
    ...getMcpAgentDelegationControllerStatusQueryKey(),
    userId,
    organizationId,
  ] as const;
}

export function useAgentDelegation(userId: string, organizationId: string) {
  return useMcpAgentDelegationControllerStatusSuspense({
    query: {
      queryKey: getAgentDelegationQueryKey(userId, organizationId),
    },
  });
}

export function useAgentDelegationMutations(
  userId: string,
  organizationId: string,
) {
  const queryClient = useQueryClient();
  const queryKey = getAgentDelegationQueryKey(userId, organizationId);

  const start = useMcpAgentDelegationControllerStart();

  const revoke = useMcpAgentDelegationControllerRevoke({
    mutation: {
      onSuccess: () => {
        queryClient.setQueryData<McpAgentDelegationStatus>(queryKey, {
          status: 'revoked',
          grantedScopes: [],
          expiresAt: null,
        });
      },
    },
  });

  const setState = (state: McpAgentDelegationStatus) => {
    queryClient.setQueryData(queryKey, state);
  };

  const refetch = () =>
    queryClient.invalidateQueries({
      queryKey,
      exact: true,
    });

  return { start, revoke, setState, refetch };
}
