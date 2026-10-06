import { Inject, Injectable } from '@nestjs/common';

import {
  AuthUserDirectoryService,
  type AuthUserIdentity,
} from '@/auth/auth-user-directory.service';
import type { OrganizationActorContext } from '@/organizations/organization-actor-context';
import { OrganizationMembershipService } from '@/organizations/organization-membership.service';
import {
  ProjectArchivedError,
  ProjectColumnNotFoundError,
  ProjectNotFoundError,
  ProjectUserNotMemberError,
  TicketArchivedError,
  TicketNotFoundError,
} from '@/projects/domain/project.error';
import type { Ticket } from '@/projects/domain/ticket';
import type { TicketComment } from '@/projects/domain/ticket-comment';
import type { CreateProjectInput } from '@/projects/dto/create-project.dto';
import type { CreateProjectColumnInput } from '@/projects/dto/create-project-column.dto';
import type { CreateTicketInput } from '@/projects/dto/create-ticket.dto';
import {
  type ProjectDetailResponse,
  type ProjectListResponse,
  toProjectDetailResponse,
  toProjectSummaryResponse,
} from '@/projects/dto/project.dto';
import {
  type ProjectColumnListResponse,
  type ProjectColumnResponse,
  toProjectColumnResponse,
} from '@/projects/dto/project-column.dto';
import type { QueryTicketsInput } from '@/projects/dto/query-tickets.dto';
import {
  type TicketDetailResponse,
  type TicketListResponse,
  toTicketDetailResponse,
  toTicketSummaryResponse,
} from '@/projects/dto/ticket.dto';
import {
  type TicketCommentResponse,
  toTicketCommentResponse,
} from '@/projects/dto/ticket-comment.dto';
import type { UpdateProjectInput } from '@/projects/dto/update-project.dto';
import type { UpdateProjectColumnInput } from '@/projects/dto/update-project-column.dto';
import type { UpdateTicketInput } from '@/projects/dto/update-ticket.dto';
import {
  ProjectRepository,
  type ProjectSummaryReadModel,
} from '@/projects/infrastructure/persistence/project.repository';
import {
  type TicketCardMetadata,
  type TicketDetailChildren,
  TicketWorkflowRepository,
} from '@/projects/infrastructure/persistence/ticket-workflow.repository';
import { ProjectResourceLoader } from '@/projects/project-resource.loader';

type ProjectUserDirectory = Pick<AuthUserDirectoryService, 'findByIds'>;
type ProjectOrganizationMembership = Pick<
  OrganizationMembershipService,
  'requireAccess' | 'hasMemberUser'
>;

@Injectable()
export class ProjectsService {
  constructor(
    private readonly projectRepository: ProjectRepository,
    private readonly ticketWorkflowRepository: TicketWorkflowRepository,
    private readonly resourceLoader: ProjectResourceLoader,
    @Inject(OrganizationMembershipService)
    private readonly organizationMembership: ProjectOrganizationMembership,
    @Inject(AuthUserDirectoryService)
    private readonly userDirectory: ProjectUserDirectory,
  ) {}

  async listProjects(
    context: OrganizationActorContext,
    organizationId: string,
  ): Promise<ProjectListResponse> {
    await this.organizationMembership.requireAccess(context, organizationId);
    const projects = await this.projectRepository.listProjects(organizationId);
    const usersById = await this.loadUsersById(
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
      await this.projectRepository.createProjectWithDefaultColumns({
        organizationId,
        key: input.key,
        name: input.name,
        description: input.description ?? '',
        leadUserId: input.leadUserId ?? null,
        createdByUserId: context.userId,
      });

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

    await this.requireProjectMutation(
      this.projectRepository.updateProject({
        organizationId,
        projectId,
        changes: {
          name: input.name,
          description: input.description,
          leadUserId: input.leadUserId,
          archivedAt:
            input.archived === undefined
              ? undefined
              : input.archived
                ? new Date()
                : null,
        },
      }),
    );

    return this.toProjectDetail(
      await this.resourceLoader.requireProject(organizationId, projectId),
    );
  }

  async listColumns(
    context: OrganizationActorContext,
    organizationId: string,
    projectId: string,
  ): Promise<ProjectColumnListResponse> {
    await this.organizationMembership.requireAccess(context, organizationId);
    await this.resourceLoader.requireProject(organizationId, projectId);
    const columns = await this.projectRepository.listColumns(
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

    const column = await this.projectRepository.createColumn(
      organizationId,
      projectId,
      input.name,
    );
    if (!column) {
      throw new ProjectNotFoundError();
    }
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

    const column = await this.projectRepository.renameColumn(
      organizationId,
      projectId,
      columnId,
      input.name,
    );
    if (!column) {
      throw new ProjectColumnNotFoundError();
    }
    return toProjectColumnResponse(column);
  }

  async listTickets(
    context: OrganizationActorContext,
    organizationId: string,
    projectId: string,
    query: QueryTicketsInput,
  ): Promise<TicketListResponse> {
    await this.organizationMembership.requireAccess(context, organizationId);
    const project = await this.resourceLoader.requireProject(
      organizationId,
      projectId,
    );

    if (query.columnId) {
      await this.resourceLoader.requireColumn(
        organizationId,
        projectId,
        query.columnId,
      );
    }
    if (query.assigneeUserId) {
      await this.assertMemberUser(organizationId, query.assigneeUserId);
    }

    const tickets = await this.projectRepository.listTickets({
      organizationId,
      projectId,
      ...query,
    });
    const [usersById, metadata] = await Promise.all([
      this.loadUsersById(
        tickets.flatMap(({ assigneeUserId }) =>
          assigneeUserId ? [assigneeUserId] : [],
        ),
      ),
      this.ticketWorkflowRepository.loadCardMetadata(
        organizationId,
        projectId,
        tickets.map(({ id }) => id),
      ),
    ]);
    const metadataByTicketId = new Map(
      metadata.map((item) => [item.ticketId, item]),
    );

    return {
      items: tickets.map((ticket) =>
        toTicketSummaryResponse(
          ticket,
          project.project.key,
          ticket.assigneeUserId
            ? usersById.get(ticket.assigneeUserId)
            : undefined,
          metadataByTicketId.get(ticket.id) ??
            emptyTicketCardMetadata(ticket.id),
        ),
      ),
    };
  }

  async createTicket(
    context: OrganizationActorContext,
    organizationId: string,
    projectId: string,
    input: CreateTicketInput,
  ): Promise<TicketDetailResponse> {
    await this.organizationMembership.requireAccess(context, organizationId);
    const project = await this.resourceLoader.requireProject(
      organizationId,
      projectId,
    );
    this.resourceLoader.assertProjectWritable(project);
    await this.assertMemberUser(organizationId, input.assigneeUserId ?? null);

    const result = await this.projectRepository.createTicketWithNumber({
      organizationId,
      projectId,
      columnId: input.columnId,
      title: input.title,
      descriptionMarkdown: input.descriptionMarkdown ?? '',
      priority: input.priority ?? 'medium',
      assigneeUserId: input.assigneeUserId ?? null,
      reporterUserId: context.userId,
      dueAt: input.dueAt ? new Date(input.dueAt) : null,
    });

    if (result.kind === 'project_not_found') {
      throw new ProjectNotFoundError();
    }
    if (result.kind === 'column_not_found') {
      throw new ProjectColumnNotFoundError();
    }

    return this.toTicketDetail(project, result.ticket);
  }

  async getTicket(
    context: OrganizationActorContext,
    organizationId: string,
    projectId: string,
    ticketId: string,
  ): Promise<TicketDetailResponse> {
    await this.organizationMembership.requireAccess(context, organizationId);
    const project = await this.resourceLoader.requireProject(
      organizationId,
      projectId,
    );
    return this.toTicketDetail(
      project,
      await this.resourceLoader.requireTicket(
        organizationId,
        projectId,
        ticketId,
      ),
    );
  }

  async updateTicket(
    context: OrganizationActorContext,
    organizationId: string,
    projectId: string,
    ticketId: string,
    input: UpdateTicketInput,
  ): Promise<TicketDetailResponse> {
    await this.organizationMembership.requireAccess(context, organizationId);
    const project = await this.resourceLoader.requireProject(
      organizationId,
      projectId,
    );
    this.resourceLoader.assertProjectWritable(project);

    const current = await this.resourceLoader.requireTicket(
      organizationId,
      projectId,
      ticketId,
    );
    if (current.archivedAt && !isTicketRestoreOnly(input)) {
      throw new TicketArchivedError();
    }
    if (input.assigneeUserId !== undefined) {
      await this.assertMemberUser(organizationId, input.assigneeUserId);
    }

    await this.requireTicketMutation(
      this.projectRepository.updateTicket({
        organizationId,
        projectId,
        ticketId,
        changes: {
          title: input.title,
          descriptionMarkdown: input.descriptionMarkdown,
          priority: input.priority,
          assigneeUserId: input.assigneeUserId,
          dueAt:
            input.dueAt === undefined
              ? undefined
              : input.dueAt
                ? new Date(input.dueAt)
                : null,
          archivedAt:
            input.archived === undefined
              ? undefined
              : input.archived
                ? new Date()
                : null,
        },
      }),
    );

    return this.toTicketDetail(
      project,
      await this.resourceLoader.requireTicket(
        organizationId,
        projectId,
        ticketId,
      ),
    );
  }

  private async toProjectDetail(
    model: ProjectSummaryReadModel,
  ): Promise<ProjectDetailResponse> {
    const usersById = await this.loadUsersById(
      model.project.leadUserId ? [model.project.leadUserId] : [],
    );
    return toProjectDetailResponse(
      model,
      model.project.leadUserId
        ? usersById.get(model.project.leadUserId)
        : undefined,
    );
  }

  private async toTicketDetail(
    project: ProjectSummaryReadModel,
    ticket: Ticket,
  ): Promise<TicketDetailResponse> {
    const children = await this.ticketWorkflowRepository.loadDetailChildren(
      project.project.organizationId,
      project.project.id,
      ticket.id,
    );
    if (!children) {
      throw new TicketNotFoundError();
    }
    const usersById = await this.loadUsersById([
      ticket.reporterUserId,
      ...(ticket.assigneeUserId ? [ticket.assigneeUserId] : []),
      ...children.comments.map(({ authorUserId }) => authorUserId),
    ]);
    const reporter = usersById.get(ticket.reporterUserId);
    if (!reporter) {
      throw new Error('티켓 reporter 사용자 정보를 조회할 수 없습니다.');
    }

    return toTicketDetailResponse(
      ticket,
      project.project.key,
      ticket.assigneeUserId ? usersById.get(ticket.assigneeUserId) : undefined,
      reporter,
      {
        metadata: metadataFromDetailChildren(ticket.id, children),
        checklists: children.checklists,
        comments: this.mapCommentResponses(children.comments, usersById),
      },
    );
  }

  private mapCommentResponses(
    comments: readonly TicketComment[],
    usersById: ReadonlyMap<string, AuthUserIdentity>,
  ): TicketCommentResponse[] {
    return comments.map((comment) => {
      const author = usersById.get(comment.authorUserId);
      if (!author) {
        throw new Error('티켓 댓글 작성자 사용자 정보를 조회할 수 없습니다.');
      }
      return toTicketCommentResponse(comment, author);
    });
  }

  private async assertMemberUser(
    organizationId: string,
    userId: string | null,
  ): Promise<void> {
    if (userId === null) {
      return;
    }
    if (
      !(await this.organizationMembership.hasMemberUser(organizationId, userId))
    ) {
      throw new ProjectUserNotMemberError();
    }
  }

  private async loadUsersById(
    userIds: readonly string[],
  ): Promise<Map<string, AuthUserIdentity>> {
    const uniqueUserIds = [...new Set(userIds)];
    if (uniqueUserIds.length === 0) {
      return new Map();
    }
    const users = await this.userDirectory.findByIds(uniqueUserIds);
    return new Map(users.map((user) => [user.id, user]));
  }

  private async requireProjectMutation<T>(
    result: Promise<T | null>,
  ): Promise<void> {
    if ((await result) === null) {
      throw new ProjectNotFoundError();
    }
  }

  private async requireTicketMutation<T>(
    result: Promise<T | null>,
  ): Promise<void> {
    if ((await result) === null) {
      throw new TicketNotFoundError();
    }
  }
}

function emptyTicketCardMetadata(ticketId: string): TicketCardMetadata {
  return {
    ticketId,
    labels: [],
    checklistItemTotal: 0,
    checklistItemCompleted: 0,
    commentCount: 0,
  };
}

function metadataFromDetailChildren(
  ticketId: string,
  children: TicketDetailChildren,
): TicketCardMetadata {
  let checklistItemTotal = 0;
  let checklistItemCompleted = 0;
  for (const { items } of children.checklists) {
    checklistItemTotal += items.length;
    checklistItemCompleted += items.filter(({ completed }) => completed).length;
  }
  return {
    ticketId,
    labels: children.labels,
    checklistItemTotal,
    checklistItemCompleted,
    commentCount: children.comments.length,
  };
}

function isProjectRestoreOnly(input: UpdateProjectInput): boolean {
  return (
    input.archived === false &&
    input.name === undefined &&
    input.description === undefined &&
    input.leadUserId === undefined
  );
}

function isTicketRestoreOnly(input: UpdateTicketInput): boolean {
  return (
    input.archived === false &&
    input.title === undefined &&
    input.descriptionMarkdown === undefined &&
    input.priority === undefined &&
    input.assigneeUserId === undefined &&
    input.dueAt === undefined
  );
}
