import { Inject, Injectable } from '@nestjs/common';

import type { OrganizationActorContext } from '@/organizations/organization-actor-context';
import { OrganizationMembershipService } from '@/organizations/organization-membership.service';
import {
  ProjectColumnNotFoundError,
  ProjectNotFoundError,
} from '@/projects/domain/project.error';
import type { CreateProjectColumnInput } from '@/projects/dto/create-project-column.dto';
import {
  type ProjectColumnListResponse,
  type ProjectColumnResponse,
  toProjectColumnResponse,
} from '@/projects/dto/project-column.dto';
import type { UpdateProjectColumnInput } from '@/projects/dto/update-project-column.dto';
import { ProjectColumnRepository } from '@/projects/infrastructure/persistence/project-column.repository';
import { ProjectResourceLoader } from '@/projects/project-resource.loader';

type ProjectColumnMembership = Pick<
  OrganizationMembershipService,
  'requireAccess'
>;

@Injectable()
export class ProjectColumnsService {
  constructor(
    private readonly projectColumnRepository: ProjectColumnRepository,
    private readonly resourceLoader: ProjectResourceLoader,
    @Inject(OrganizationMembershipService)
    private readonly organizationMembership: ProjectColumnMembership,
  ) {}

  async listColumns(
    context: OrganizationActorContext,
    organizationId: string,
    projectId: string,
  ): Promise<ProjectColumnListResponse> {
    await this.organizationMembership.requireAccess(context, organizationId);
    await this.resourceLoader.requireProject(organizationId, projectId);
    const columns = await this.projectColumnRepository.listColumns(
      organizationId,
      projectId,
    );
    return { items: columns.map(toProjectColumnResponse) };
  }

  async createColumn(
    context: OrganizationActorContext,
    organizationId: string,
    projectId: string,
    input: CreateProjectColumnInput,
  ): Promise<ProjectColumnResponse> {
    await this.organizationMembership.requireAccess(context, organizationId);
    const project = await this.resourceLoader.requireProject(
      organizationId,
      projectId,
    );
    this.resourceLoader.assertProjectWritable(project);
    const column = await this.projectColumnRepository.createColumn(
      organizationId,
      projectId,
      input.name,
    );
    if (!column) throw new ProjectNotFoundError();
    return toProjectColumnResponse(column);
  }

  async updateColumn(
    context: OrganizationActorContext,
    organizationId: string,
    projectId: string,
    columnId: string,
    input: UpdateProjectColumnInput,
  ): Promise<ProjectColumnResponse> {
    await this.organizationMembership.requireAccess(context, organizationId);
    const project = await this.resourceLoader.requireProject(
      organizationId,
      projectId,
    );
    this.resourceLoader.assertProjectWritable(project);
    const column = await this.projectColumnRepository.renameColumn(
      organizationId,
      projectId,
      columnId,
      input.name,
    );
    if (!column) throw new ProjectColumnNotFoundError();
    return toProjectColumnResponse(column);
  }
}
