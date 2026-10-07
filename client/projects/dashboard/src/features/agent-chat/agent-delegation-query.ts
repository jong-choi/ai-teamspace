import {
  type AgentDelegationState,
  getAgentDelegationGateway,
} from '@core/features/agent-chat/lib/agent-delegation-gateway';

import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query';

export function getAgentDelegationQueryKey(
  userId: string,
  organizationId: string,
) {
  return ['agent-delegation', userId, organizationId] as const;
}

export function useAgentDelegation(userId: string, organizationId: string) {
  return useSuspenseQuery({
    queryKey: getAgentDelegationQueryKey(userId, organizationId),
    queryFn: () => getAgentDelegationGateway().get(),
  });
}

export function useAgentDelegationMutations(
  userId: string,
  organizationId: string,
) {
  const queryClient = useQueryClient();
  const queryKey = getAgentDelegationQueryKey(userId, organizationId);

  const start = useMutation({
    mutationFn: (returnTo: string) =>
      getAgentDelegationGateway().start(returnTo),
  });

  const revoke = useMutation({
    mutationFn: () => getAgentDelegationGateway().revoke(),
    onSuccess: () => {
      queryClient.setQueryData<AgentDelegationState>(queryKey, {
        status: 'revoked',
        grantedScopes: [],
        expiresAt: null,
      });
    },
  });

  const setState = (state: AgentDelegationState) => {
    queryClient.setQueryData(queryKey, state);
  };

  const refetch = () =>
    queryClient.invalidateQueries({
      queryKey,
      exact: true,
    });

  return { start, revoke, setState, refetch };
}
