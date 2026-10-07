import {
  getAgentMcpConnectionsControllerDiscoverToolsQueryKey,
  getAgentMcpConnectionsControllerGetQueryKey,
  getAgentMcpConnectionsControllerListQueryKey,
  useAgentMcpConnectionsControllerCreate,
  useAgentMcpConnectionsControllerRemove,
  useAgentMcpConnectionsControllerStartOauth,
  useAgentMcpConnectionsControllerTestConnection,
  useAgentMcpConnectionsControllerUpdate,
  useAgentMcpConnectionsControllerUpdateToolPolicy,
} from '@repo/client/api-client';
import { getProblemDetails } from '@repo/client/api-client/runtime';
import { useDashboardPlatform } from '@core/app/platform/dashboard-platform';

import { useQueryClient } from '@tanstack/react-query';

export function agentIntegrationErrorMessage(
  error: unknown,
  fallback: string,
): string {
  return getProblemDetails(error)?.detail ?? fallback;
}

export function useAgentIntegrationMutations() {
  const queryClient = useQueryClient();
  const { notifySuccess } = useDashboardPlatform();
  const listKey = getAgentMcpConnectionsControllerListQueryKey();

  const create = useAgentMcpConnectionsControllerCreate({
    mutation: {
      onSuccess: async (connection) => {
        queryClient.setQueryData(
          getAgentMcpConnectionsControllerGetQueryKey(connection.id),
          connection,
        );
        await queryClient.invalidateQueries({ queryKey: listKey });
        notifySuccess({ title: '외부 MCP 연결 정보를 저장했습니다.' });
      },
    },
  });

  const update = useAgentMcpConnectionsControllerUpdate({
    mutation: {
      onSuccess: async (connection) => {
        queryClient.setQueryData(
          getAgentMcpConnectionsControllerGetQueryKey(connection.id),
          connection,
        );
        await queryClient.invalidateQueries({ queryKey: listKey });
      },
    },
  });

  const remove = useAgentMcpConnectionsControllerRemove({
    mutation: {
      onSuccess: async (_result, variables) => {
        queryClient.removeQueries({
          queryKey: getAgentMcpConnectionsControllerGetQueryKey(
            variables.connectionId,
          ),
        });
        queryClient.removeQueries({
          queryKey: getAgentMcpConnectionsControllerDiscoverToolsQueryKey(
            variables.connectionId,
          ),
        });
        await queryClient.invalidateQueries({ queryKey: listKey });
        notifySuccess({ title: '외부 MCP 연결을 삭제했습니다.' });
      },
    },
  });

  const testConnection = useAgentMcpConnectionsControllerTestConnection({
    mutation: {
      onSuccess: async (_result, variables) => {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: listKey }),
          queryClient.invalidateQueries({
            queryKey: getAgentMcpConnectionsControllerGetQueryKey(
              variables.connectionId,
            ),
          }),
          queryClient.invalidateQueries({
            queryKey: getAgentMcpConnectionsControllerDiscoverToolsQueryKey(
              variables.connectionId,
            ),
          }),
        ]);
      },
    },
  });

  const updateToolPolicy = useAgentMcpConnectionsControllerUpdateToolPolicy({
    mutation: {
      onSuccess: async (connection, variables) => {
        queryClient.setQueryData(
          getAgentMcpConnectionsControllerGetQueryKey(connection.id),
          connection,
        );
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: listKey }),
          queryClient.invalidateQueries({
            queryKey: getAgentMcpConnectionsControllerDiscoverToolsQueryKey(
              variables.connectionId,
            ),
          }),
        ]);
        notifySuccess({
          title: 'Agent가 사용할 외부 MCP 도구를 저장했습니다.',
        });
      },
    },
  });

  const startOauth = useAgentMcpConnectionsControllerStartOauth();

  const refreshConnection = async (connectionId: string) => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: listKey }),
      queryClient.invalidateQueries({
        queryKey: getAgentMcpConnectionsControllerGetQueryKey(connectionId),
      }),
      queryClient.invalidateQueries({
        queryKey:
          getAgentMcpConnectionsControllerDiscoverToolsQueryKey(connectionId),
      }),
    ]);
  };

  return {
    create,
    remove,
    startOauth,
    testConnection,
    update,
    updateToolPolicy,
    refreshConnection,
  };
}
