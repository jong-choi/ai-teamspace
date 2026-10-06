import { Inject, Injectable } from '@nestjs/common';

import type { AuthUserIdentity } from '@/auth/auth-user-directory.service';
import type { OrganizationActorContext } from '@/organizations/organization-actor-context';
import { OrganizationMembershipService } from '@/organizations/organization-membership.service';
import {
  ProjectColumnNotFoundError,
  ProjectNotFoundError,
  ProjectUserNotMemberError,
  TicketArchivedError,
  TicketNotFoundError,
} from '@/projects/domain/project.error';
import type { Ticket } from '@/projects/domain/ticket';
import type { TicketComment } from '@/projects/domain/ticket-comment';
import type { CreateTicketInput } from '@/projects/dto/create-ticket.dto';
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
import type { UpdateTicketInput } from '@/projects/dto/update-ticket.dto';
import { type ProjectSummaryReadModel } from '@/projects/infrastructure/persistence/project.repository';
import {
  type TicketCardMetadata,
  type TicketDetailChildren,
  TicketDetailQueryRepository,
} from '@/projects/infrastructure/persistence/ticket-detail-query.repository';
import { TicketRepository } from '@/projects/infrastructure/persistence/ticket.repository';
import { ProjectResourceLoader } from '@/projects/project-resource.loader';
import { ProjectUserResolver } from '@/projects/project-user.resolver';

type TicketOrganizationMembership = Pick<
  OrganizationMembershipService,
  'requireAccess' | 'hasMemberUser'
>;

@Injectable()
export class TicketsService {
  constructor(
    private readonly ticketRepository: TicketRepository,
    private readonly ticketDetailQueryRepository: TicketDetailQueryRepository,
    private readonly resourceLoader: ProjectResourceLoader,
    @Inject(OrganizationMembershipService)
    private readonly organizationMembership: TicketOrganizationMembership,
    private readonly userResolver: ProjectUserResolver,
  ) {}

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
    const tickets = await this.ticketRepository.listTickets(
      organizationId,
      projectId,
      query,
    );
    const [usersById, metadata] = await Promise.all([
      this.userResolver.findByIds(
        tickets.flatMap(({ assigneeUserId }) =>
          assigneeUserId ? [assigneeUserId] : [],
        ),
      ),
      this.ticketDetailQueryRepository.loadCardMetadata(
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
    const result = await this.ticketRepository.createTicketWithNumber(
      organizationId,
      projectId,
      context.userId,
      input,
    );
    if (result.kind === 'project_not_found') throw new ProjectNotFoundError();
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
    const updated = await this.ticketRepository.updateTicket(
      organizationId,
      projectId,
      ticketId,
      input,
    );
    if (!updated) throw new TicketNotFoundError();
    return this.toTicketDetail(
      project,
      await this.resourceLoader.requireTicket(
        organizationId,
        projectId,
        ticketId,
      ),
    );
  }

  private async toTicketDetail(
    project: ProjectSummaryReadModel,
    ticket: Ticket,
  ): Promise<TicketDetailResponse> {
    const children = await this.ticketDetailQueryRepository.loadDetailChildren(
      project.project.organizationId,
      project.project.id,
      ticket.id,
    );
    if (!children) throw new TicketNotFoundError();
    const usersById = await this.userResolver.findByIds([
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
    if (userId === null) return;
    if (
      !(await this.organizationMembership.hasMemberUser(organizationId, userId))
    ) {
      throw new ProjectUserNotMemberError();
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
