import {
  getProjectsControllerGetProjectQueryKey,
  getProjectsControllerGetTicketQueryKey,
  getProjectsControllerListProjectsQueryKey,
  getProjectsControllerListTicketsQueryKey,
} from '@repo/client/api-client';

import type { QueryClient } from '@tanstack/react-query';

export function invalidateTicketDetail(
  queryClient: QueryClient,
  organizationId: string,
  projectId: string,
  ticketId: string,
) {
  return queryClient.invalidateQueries({
    queryKey: getProjectsControllerGetTicketQueryKey(
      organizationId,
      projectId,
      ticketId,
    ),
  });
}

export function invalidateTicketSummary(
  queryClient: QueryClient,
  organizationId: string,
  projectId: string,
) {
  return queryClient.invalidateQueries({
    exact: false,
    queryKey: getProjectsControllerListTicketsQueryKey(
      organizationId,
      projectId,
    ),
  });
}

export function invalidateProjectStats(
  queryClient: QueryClient,
  organizationId: string,
  projectId: string,
) {
  return Promise.all([
    queryClient.invalidateQueries({
      queryKey: getProjectsControllerGetProjectQueryKey(
        organizationId,
        projectId,
      ),
    }),
    queryClient.invalidateQueries({
      queryKey: getProjectsControllerListProjectsQueryKey(organizationId),
    }),
  ]);
}
