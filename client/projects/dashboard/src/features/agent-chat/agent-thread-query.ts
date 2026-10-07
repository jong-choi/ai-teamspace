import { useOrganizationsControllerGetActiveSuspense } from '@repo/client/api-client';
import type { OrganizationAccess } from '@repo/client/api-client/schemas';
import { useAgentChatPlatform } from '@core/features/agent-chat/agent-chat-platform';
import { agentAssistantId } from '@core/features/agent-chat/lib/agent-protocol-client';

import { useSuspenseQuery } from '@tanstack/react-query';

export function useAgentActiveOrganization() {
  return useOrganizationsControllerGetActiveSuspense<OrganizationAccess | null>(
    {
      query: {
        select: (response) => response.activeOrganization,
      },
    },
  );
}

export function getAgentThreadsQueryKey(
  userId: string,
  organizationId: string,
) {
  return ['agent-threads', userId, organizationId, agentAssistantId] as const;
}

export function useAgentThreads(userId: string, organizationId: string) {
  const { client } = useAgentChatPlatform();

  return useSuspenseQuery({
    queryKey: getAgentThreadsQueryKey(userId, organizationId),
    queryFn: () =>
      client.threads.search({
        limit: 50,
        offset: 0,
        sortBy: 'updated_at',
        sortOrder: 'desc',
      }),
  });
}

export function getAgentThreadQueryKey(
  userId: string,
  organizationId: string,
  threadId: string,
) {
  return [
    'agent-thread',
    userId,
    organizationId,
    agentAssistantId,
    threadId,
  ] as const;
}

export function useAgentThread(
  userId: string,
  organizationId: string,
  threadId: string,
) {
  const { client } = useAgentChatPlatform();

  return useSuspenseQuery({
    queryKey: getAgentThreadQueryKey(userId, organizationId, threadId),
    queryFn: () => client.threads.get(threadId),
  });
}
