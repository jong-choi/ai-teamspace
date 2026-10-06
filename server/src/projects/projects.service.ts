import { Inject, Injectable } from '@nestjs/common';

import type { OrganizationActorContext } from '@/organizations/organization-actor-context';
import { OrganizationMembershipService } from '@/organizations/organization-membership.service';
import {
  ProjectArchivedError,
  ProjectNotFoundError,
  ProjectUserNotMemberError,
} from '@/projects/domain/project.error';
import type { CreateProjectInput } from '@/projects/dto/create-project.dto';
import {
  type ProjectDetailResponse,
  type ProjectListResponse,
  toProjectDetailResponse,
  toProjectSummaryResponse,
} from '@/projects/dto/project.dto';
import type { UpdateProjectInput } from '@/projects/dto/update-project.dto';
import {
  ProjectRepository,
  type ProjectSummaryReadModel,
} from '@/projects/infrastructure/persistence/project.repository';
import { ProjectResourceLoader } from '@/projects/project-resource.loader';
import { ProjectUserResolver } from '@/projects/project-user.resolver';

type ProjectOrganizationMembership = Pick<
  OrganizationMembershipService,
  'requireAccess' | 'hasMemberUser'
>;

@Injectable()
export class ProjectsService {
  constructor(
    private readonly projectRepository: ProjectRepository,
    private readonly resourceLoader: ProjectResourceLoader,
    @Inject(OrganizationMembershipService)
    private readonly organizationMembership: ProjectOrganizationMembership,
    private readonly userResolver: ProjectUserResolver,
  ) {}

  async listProjects(
    context: OrganizationActorContext,
    organizationId: string,
  ): Promise<ProjectListResponse> {
    await this.organizationMembership.requireAccess(context, organizationId);
    const projects = await this.projectRepository.listProjects(organizationId);
    const usersById = await this.userResolver.findByIds(
      projects.flatMap(({ project }) =>
        project.leadUserId ? [project.leadUserId] : [],
      ),
    );
    return {
      items: projects.map((model) =>
        toProjectSummaryResponse(
          model,
          model.project.leadUserId
            ? usersById.get(model.project.leadUserId)
            : undefined,
        ),
      ),
    };
  }

  async createProject(
    context: OrganizationActorContext,
    organizationId: string,
    input: CreateProjectInput,
  ): Promise<ProjectDetailResponse> {
    await this.organizationMembership.requireAccess(context, organizationId);
    await this.assertMemberUser(organizationId, input.leadUserId ?? null);
    const project =
      await this.projectRepository.createProjectWithDefaultColumns(
        organizationId,
        context.userId,
        input,
      );
    return this.toProjectDetail(
      await this.resourceLoader.requireProject(organizationId, project.id),
    );
  }

  async getProject(
    context: OrganizationActorContext,
    organizationId: string,
    projectId: string,
  ): Promise<ProjectDetailResponse> {
    await this.organizationMembership.requireAccess(context, organizationId);
    return this.toProjectDetail(
      await this.resourceLoader.requireProject(organizationId, projectId),
    );
  }

  async updateProject(
    context: OrganizationActorContext,
    organizationId: string,
    projectId: string,
    input: UpdateProjectInput,
  ): Promise<ProjectDetailResponse> {
    await this.organizationMembership.requireAccess(context, organizationId);
    const current = await this.resourceLoader.requireProject(
      organizationId,
      projectId,
    );
    if (current.project.archivedAt && !isProjectRestoreOnly(input)) {
      throw new ProjectArchivedError();
    }
    if (input.leadUserId !== undefined) {
      await this.assertMemberUser(organizationId, input.leadUserId);
    }
    const updated = await this.projectRepository.updateProject(
      organizationId,
      projectId,
      input,
    );
    if (!updated) throw new ProjectNotFoundError();
    return this.toProjectDetail(
      await this.resourceLoader.requireProject(organizationId, projectId),
    );
  }

  private async toProjectDetail(
    model: ProjectSummaryReadModel,
  ): Promise<ProjectDetailResponse> {
    const usersById = await this.userResolver.findByIds(
      model.project.leadUserId ? [model.project.leadUserId] : [],
    );
    return toProjectDetailResponse(
      model,
      model.project.leadUserId
        ? usersById.get(model.project.leadUserId)
        : undefined,
    );
  }

  private async assertMemberUser(
    organizationId: string,
    userId: string | null,
  ): Promise<void> {
    if (userId === null) return;
    if (
      !(await this.organizationMembership.hasMemberUser(organizationId, userId))
    ) {
      throw new ProjectUserNotMemberError();
    }
  }
}

function isProjectRestoreOnly(input: UpdateProjectInput): boolean {
  return (
    input.archived === false &&
    input.name === undefined &&
    input.description === undefined &&
    input.leadUserId === undefined
  );
}
