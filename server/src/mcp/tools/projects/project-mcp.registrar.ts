import { Inject, Injectable } from '@nestjs/common';

import { bindMcpTool, type BoundMcpTool } from '@/mcp/tools/bound-mcp-tool';
import { toMcpOrganizationActor } from '@/mcp/tools/mcp-application-actor';
import { projectTicketReceipt } from '@/mcp/tools/mcp-mutation-receipt.mapper';
import {
  projectColumnsListTool,
  projectGetTool,
  projectsListTool,
  projectTicketCreateTool,
  projectTicketGetTool,
  projectTicketMoveTool,
  projectTicketUpdateTool,
} from '@/mcp/tools/projects/project-tool-definitions';
import { ProjectColumnsService } from '@/projects/project-columns.service';
import { ProjectsService } from '@/projects/projects.service';
import { TicketOrderingService } from '@/projects/ticket-ordering.service';
import { TicketsService } from '@/projects/tickets.service';

type ProjectToolsService = Pick<ProjectsService, 'listProjects' | 'getProject'>;

type ProjectColumnToolsService = Pick<ProjectColumnsService, 'listColumns'>;

type TicketToolsService = Pick<
  TicketsService,
  'getTicket' | 'createTicket' | 'updateTicket'
>;

type TicketOrderingToolsService = Pick<TicketOrderingService, 'moveTicket'>;

@Injectable()
export class ProjectMcpRegistrar {
  constructor(
    @Inject(ProjectsService)
    private readonly projectsService: ProjectToolsService,
    @Inject(ProjectColumnsService)
    private readonly projectColumnsService: ProjectColumnToolsService,
    @Inject(TicketsService)
    private readonly ticketsService: TicketToolsService,
    @Inject(TicketOrderingService)
    private readonly ticketOrderingService: TicketOrderingToolsService,
  ) {}

  tools(): BoundMcpTool[] {
    return [
      bindMcpTool(projectsListTool, async (input, auth) =>
        this.projectsService.listProjects(
          toMcpOrganizationActor(auth),
          input.organizationId,
        ),
      ),
      bindMcpTool(projectGetTool, async (input, auth) =>
        this.projectsService.getProject(
          toMcpOrganizationActor(auth),
          input.organizationId,
          input.projectId,
        ),
      ),
      bindMcpTool(projectColumnsListTool, async (input, auth) =>
        this.projectColumnsService.listColumns(
          toMcpOrganizationActor(auth),
          input.organizationId,
          input.projectId,
        ),
      ),
      bindMcpTool(projectTicketGetTool, async (input, auth) =>
        this.ticketsService.getTicket(
          toMcpOrganizationActor(auth),
          input.organizationId,
          input.projectId,
          input.ticketId,
        ),
      ),
      bindMcpTool(projectTicketCreateTool, async (input, auth) => {
        const { organizationId, projectId, ...body } = input;
        const result = await this.ticketsService.createTicket(
          toMcpOrganizationActor(auth),
          organizationId,
          projectId,
          body,
        );
        return {
          result,
          mutation: projectTicketReceipt({
            organizationId,
            projectId: result.projectId,
            ticketId: result.id,
            updatedAt: result.updatedAt,
            operation: 'created',
          }),
        };
      }),
      bindMcpTool(projectTicketUpdateTool, async (input, auth) => {
        const { organizationId, projectId, ticketId, ...body } = input;
        const result = await this.ticketsService.updateTicket(
          toMcpOrganizationActor(auth),
          organizationId,
          projectId,
          ticketId,
          body,
        );
        return {
          result,
          mutation: projectTicketReceipt({
            organizationId,
            projectId: result.projectId,
            ticketId: result.id,
            updatedAt: result.updatedAt,
            operation: 'updated',
          }),
        };
      }),
      bindMcpTool(projectTicketMoveTool, async (input, auth) => {
        const { organizationId, projectId, ticketId, ...body } = input;
        const result = await this.ticketOrderingService.moveTicket(
          toMcpOrganizationActor(auth),
          organizationId,
          projectId,
          ticketId,
          body,
        );
        return {
          result,
          mutation: projectTicketReceipt({
            organizationId,
            projectId,
            ticketId: result.ticketId,
            updatedAt: result.updatedAt,
            operation: 'moved',
          }),
        };
      }),
    ];
  }
}
