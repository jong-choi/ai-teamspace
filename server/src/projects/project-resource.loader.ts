import { Injectable } from '@nestjs/common';

import {
  ProjectArchivedError,
  ProjectColumnNotFoundError,
  ProjectNotFoundError,
  TicketNotFoundError,
} from '@/projects/domain/project.error';
import type { Ticket } from '@/projects/domain/ticket';
import { ProjectColumnRepository } from '@/projects/infrastructure/persistence/project-column.repository';
import {
  ProjectRepository,
  type ProjectSummaryReadModel,
} from '@/projects/infrastructure/persistence/project.repository';
import { TicketRepository } from '@/projects/infrastructure/persistence/ticket.repository';

@Injectable()
export class ProjectResourceLoader {
  constructor(
    private readonly projectRepository: ProjectRepository,
    private readonly projectColumnRepository: ProjectColumnRepository,
    private readonly ticketRepository: TicketRepository,
  ) {}

  async requireProject(
    organizationId: string,
    projectId: string,
  ): Promise<ProjectSummaryReadModel> {
    const project = await this.projectRepository.findProjectById(
      organizationId,
      projectId,
    );
    if (!project) {
      throw new ProjectNotFoundError();
    }
    return project;
  }

  async requireColumn(
    organizationId: string,
    projectId: string,
    columnId: string,
  ): Promise<void> {
    const column = await this.projectColumnRepository.findColumnById(
      organizationId,
      projectId,
      columnId,
    );
    if (!column) {
      throw new ProjectColumnNotFoundError();
    }
  }

  async requireTicket(
    organizationId: string,
    projectId: string,
    ticketId: string,
  ): Promise<Ticket> {
    const ticket = await this.ticketRepository.findTicketById(
      organizationId,
      projectId,
      ticketId,
    );
    if (!ticket) {
      throw new TicketNotFoundError();
    }
    return ticket;
  }

  assertProjectWritable(project: ProjectSummaryReadModel): void {
    if (project.project.archivedAt) {
      throw new ProjectArchivedError();
    }
  }
}
