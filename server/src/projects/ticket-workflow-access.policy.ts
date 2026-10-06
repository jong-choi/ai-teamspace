import { Inject, Injectable } from '@nestjs/common';

import type { OrganizationActorContext } from '@/organizations/organization-actor-context';
import { OrganizationMembershipService } from '@/organizations/organization-membership.service';
import { TicketArchivedError } from '@/projects/domain/project.error';
import type { Ticket } from '@/projects/domain/ticket';
import { ProjectResourceLoader } from '@/projects/project-resource.loader';

type WorkflowOrganizationMembership = Pick<
  OrganizationMembershipService,
  'requireAccess'
>;

@Injectable()
export class TicketWorkflowAccessPolicy {
  constructor(
    private readonly resourceLoader: ProjectResourceLoader,
    @Inject(OrganizationMembershipService)
    private readonly organizationMembership: WorkflowOrganizationMembership,
  ) {}

  async requireReadableProject(
    context: OrganizationActorContext,
    organizationId: string,
    projectId: string,
  ): Promise<void> {
    await this.organizationMembership.requireAccess(context, organizationId);
    await this.resourceLoader.requireProject(organizationId, projectId);
  }

  async requireWritableProject(
    context: OrganizationActorContext,
    organizationId: string,
    projectId: string,
  ): Promise<void> {
    await this.organizationMembership.requireAccess(context, organizationId);
    const project = await this.resourceLoader.requireProject(
      organizationId,
      projectId,
    );
    this.resourceLoader.assertProjectWritable(project);
  }

  async requireReadableTicket(
    context: OrganizationActorContext,
    organizationId: string,
    projectId: string,
    ticketId: string,
  ): Promise<Ticket> {
    await this.requireReadableProject(context, organizationId, projectId);
    return this.resourceLoader.requireTicket(
      organizationId,
      projectId,
      ticketId,
    );
  }

  async requireWritableTicket(
    context: OrganizationActorContext,
    organizationId: string,
    projectId: string,
    ticketId: string,
  ): Promise<Ticket> {
    await this.requireWritableProject(context, organizationId, projectId);
    const ticket = await this.resourceLoader.requireTicket(
      organizationId,
      projectId,
      ticketId,
    );
    if (ticket.archivedAt) {
      throw new TicketArchivedError();
    }
    return ticket;
  }
}
