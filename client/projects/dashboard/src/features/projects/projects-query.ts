import {
  getOrganizationsControllerListMembersSuspenseQueryOptions,
  useOrganizationsControllerGetActiveSuspense,
  useOrganizationsControllerListMembersSuspense,
  useProjectsControllerGetProjectSuspense,
  useProjectsControllerGetTicketSuspense,
  useProjectsControllerListProjectColumnsSuspense,
  useProjectsControllerListProjectsSuspense,
  useProjectsControllerListTicketsSuspense,
  useTicketWorkflowControllerListProjectLabelsSuspense,
} from '@repo/client/api-client';
import type {
  OrganizationAccess,
  OrganizationMember,
  ProjectsControllerListTicketsParams,
} from '@repo/client/api-client/schemas';
import { ProjectsControllerListTicketsParams as ProjectsControllerListTicketsParamsSchema } from '@repo/client/api-client/schemas';

import { useSuspenseQueries } from '@tanstack/react-query';

const MEMBER_PAGE_SIZE = 100;

export function useProjectsActiveOrganization() {
  return useOrganizationsControllerGetActiveSuspense<OrganizationAccess | null>(
    {
      query: {
        select: (response) => response.activeOrganization,
      },
    },
  );
}

export function useProjects(organizationId: string) {
  return useProjectsControllerListProjectsSuspense(organizationId);
}

export function useProject(organizationId: string, projectId: string) {
  return useProjectsControllerGetProjectSuspense(organizationId, projectId);
}

export function useProjectColumns(organizationId: string, projectId: string) {
  return useProjectsControllerListProjectColumnsSuspense(
    organizationId,
    projectId,
  );
}

export function useProjectTickets(
  organizationId: string,
  projectId: string,
  params: ProjectsControllerListTicketsParams,
) {
  return useProjectsControllerListTicketsSuspense(
    organizationId,
    projectId,
    ProjectsControllerListTicketsParamsSchema.parse(params),
  );
}

export function useProjectTicketDetail(
  organizationId: string,
  projectId: string,
  ticketId: string,
) {
  return useProjectsControllerGetTicketSuspense(
    organizationId,
    projectId,
    ticketId,
  );
}

export function useProjectLabels(organizationId: string, projectId: string) {
  return useTicketWorkflowControllerListProjectLabelsSuspense(
    organizationId,
    projectId,
  );
}

export function useProjectMembers(
  organizationId: string,
): OrganizationMember[] {
  const firstPage = useOrganizationsControllerListMembersSuspense(
    organizationId,
    {
      limit: MEMBER_PAGE_SIZE,
      offset: 0,
    },
  ).data;
  const additionalPageCount = Math.max(
    0,
    Math.ceil(firstPage.total / MEMBER_PAGE_SIZE) - 1,
  );
  const additionalPages = useSuspenseQueries({
    queries: Array.from({ length: additionalPageCount }, (_, index) =>
      getOrganizationsControllerListMembersSuspenseQueryOptions(
        organizationId,
        {
          limit: MEMBER_PAGE_SIZE,
          offset: (index + 1) * MEMBER_PAGE_SIZE,
        },
      ),
    ),
  });

  const members = [
    ...firstPage.items,
    ...additionalPages.flatMap(({ data }) => data.items),
  ];
  return [
    ...new Map(members.map((member) => [member.userId, member])).values(),
  ];
}
