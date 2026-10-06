import { Inject, Injectable } from '@nestjs/common';

import {
  AuthUserDirectoryService,
  type AuthUserIdentity,
} from '@/auth/auth-user-directory.service';
import type { OrganizationActorContext } from '@/organizations/organization-actor-context';
import { OrganizationMembershipService } from '@/organizations/organization-membership.service';
import {
  ProjectColumnNotFoundError,
  ProjectNotFoundError,
  TicketArchivedError,
  TicketChecklistItemNotFoundError,
  TicketChecklistMoveReferenceInvalidError,
  TicketChecklistNotFoundError,
  TicketCommentAuthorRequiredError,
  TicketCommentNotFoundError,
  TicketLabelNotFoundError,
  TicketMoveReferenceInvalidError,
  TicketNotFoundError,
} from '@/projects/domain/project.error';
import type { Ticket } from '@/projects/domain/ticket';
import type { TicketComment } from '@/projects/domain/ticket-comment';
import type { CreateTicketChecklistInput } from '@/projects/dto/create-ticket-checklist.dto';
import type { CreateTicketChecklistItemInput } from '@/projects/dto/create-ticket-checklist-item.dto';
import type { CreateTicketCommentInput } from '@/projects/dto/create-ticket-comment.dto';
import type { CreateTicketLabelInput } from '@/projects/dto/create-ticket-label.dto';
import {
  type MoveTicketInput,
  type MoveTicketResponse,
} from '@/projects/dto/move-ticket.dto';
import {
  type MoveTicketChecklistItemInput,
  type MoveTicketChecklistItemResponse,
} from '@/projects/dto/move-ticket-checklist-item.dto';
import {
  type TicketChecklistItemResponse,
  type TicketChecklistResponse,
  toTicketChecklistItemResponse,
  toTicketChecklistResponse,
} from '@/projects/dto/ticket-checklist.dto';
import {
  type TicketCommentListResponse,
  type TicketCommentResponse,
  toTicketCommentResponse,
} from '@/projects/dto/ticket-comment.dto';
import {
  type TicketLabelListResponse,
  type TicketLabelResponse,
  toTicketLabelResponse,
} from '@/projects/dto/ticket-label.dto';
import type { UpdateTicketChecklistInput } from '@/projects/dto/update-ticket-checklist.dto';
import type { UpdateTicketChecklistItemInput } from '@/projects/dto/update-ticket-checklist-item.dto';
import type { UpdateTicketCommentInput } from '@/projects/dto/update-ticket-comment.dto';
import type { UpdateTicketLabelInput } from '@/projects/dto/update-ticket-label.dto';
import { TicketWorkflowRepository } from '@/projects/infrastructure/persistence/ticket-workflow.repository';
import { ProjectResourceLoader } from '@/projects/project-resource.loader';

type WorkflowUserDirectory = Pick<AuthUserDirectoryService, 'findByIds'>;
type WorkflowOrganizationMembership = Pick<
  OrganizationMembershipService,
  'requireAccess'
>;

@Injectable()
export class TicketWorkflowService {
  constructor(
    private readonly workflowRepository: TicketWorkflowRepository,
    private readonly resourceLoader: ProjectResourceLoader,
    @Inject(OrganizationMembershipService)
    private readonly organizationMembership: WorkflowOrganizationMembership,
    @Inject(AuthUserDirectoryService)
    private readonly userDirectory: WorkflowUserDirectory,
  ) {}

  async moveTicket(
    context: OrganizationActorContext,
    organizationId: string,
    projectId: string,
    ticketId: string,
    input: MoveTicketInput,
  ): Promise<MoveTicketResponse> {
    await this.requireWritableTicketContext(
      context,
      organizationId,
      projectId,
      ticketId,
    );

    const result = await this.workflowRepository.moveTicket({
      organizationId,
      projectId,
      ticketId,
      targetColumnId: input.targetColumnId,
      beforeTicketId: input.beforeTicketId ?? null,
      afterTicketId: input.afterTicketId ?? null,
    });

    switch (result.kind) {
      case 'project_not_found':
        throw new ProjectNotFoundError();
      case 'ticket_not_found':
        throw new TicketNotFoundError();
      case 'column_not_found':
        throw new ProjectColumnNotFoundError();
      case 'reference_not_found':
        throw new TicketMoveReferenceInvalidError();
      case 'moved':
        return {
          ticketId: result.ticket.id,
          columnId: result.ticket.columnId,
          position: result.ticket.position,
          updatedAt: result.ticket.updatedAt.toISOString(),
        };
    }
  }

  async listLabels(
    context: OrganizationActorContext,
    organizationId: string,
    projectId: string,
  ): Promise<TicketLabelListResponse> {
    await this.organizationMembership.requireAccess(context, organizationId);
    await this.resourceLoader.requireProject(organizationId, projectId);
    const labels = await this.workflowRepository.listLabels(
      organizationId,
      projectId,
    );
    return { items: labels.map(toTicketLabelResponse) };
  }

  async createLabel(
    context: OrganizationActorContext,
    organizationId: string,
    projectId: string,
    input: CreateTicketLabelInput,
  ): Promise<TicketLabelResponse> {
    await this.requireWritableProjectContext(
      context,
      organizationId,
      projectId,
    );
    const label = await this.workflowRepository.createLabel({
      organizationId,
      projectId,
      name: input.name,
      color: input.color ?? 'neutral',
    });
    if (!label) {
      throw new ProjectNotFoundError();
    }
    return toTicketLabelResponse(label);
  }

  async updateLabel(
    context: OrganizationActorContext,
    organizationId: string,
    projectId: string,
    labelId: string,
    input: UpdateTicketLabelInput,
  ): Promise<TicketLabelResponse> {
    await this.requireWritableProjectContext(
      context,
      organizationId,
      projectId,
    );
    const label = await this.workflowRepository.updateLabel({
      organizationId,
      projectId,
      labelId,
      ...input,
    });
    if (!label) {
      throw new TicketLabelNotFoundError();
    }
    return toTicketLabelResponse(label);
  }

  async attachLabel(
    context: OrganizationActorContext,
    organizationId: string,
    projectId: string,
    ticketId: string,
    labelId: string,
  ): Promise<TicketLabelResponse> {
    await this.requireWritableTicketContext(
      context,
      organizationId,
      projectId,
      ticketId,
    );
    const label = await this.workflowRepository.attachLabel({
      organizationId,
      projectId,
      ticketId,
      labelId,
    });
    if (!label) {
      throw new TicketLabelNotFoundError();
    }
    return toTicketLabelResponse(label);
  }

  async detachLabel(
    context: OrganizationActorContext,
    organizationId: string,
    projectId: string,
    ticketId: string,
    labelId: string,
  ): Promise<void> {
    await this.requireWritableTicketContext(
      context,
      organizationId,
      projectId,
      ticketId,
    );
    const detached = await this.workflowRepository.detachLabel({
      organizationId,
      projectId,
      ticketId,
      labelId,
    });
    if (!detached) {
      throw new TicketLabelNotFoundError();
    }
  }

  async createChecklist(
    context: OrganizationActorContext,
    organizationId: string,
    projectId: string,
    ticketId: string,
    input: CreateTicketChecklistInput,
  ): Promise<TicketChecklistResponse> {
    await this.requireWritableTicketContext(
      context,
      organizationId,
      projectId,
      ticketId,
    );
    const model = await this.workflowRepository.createChecklist({
      organizationId,
      projectId,
      ticketId,
      title: input.title,
    });
    if (!model) {
      throw new TicketNotFoundError();
    }
    return toTicketChecklistResponse(model.checklist, model.items);
  }

  async updateChecklist(
    context: OrganizationActorContext,
    organizationId: string,
    projectId: string,
    ticketId: string,
    checklistId: string,
    input: UpdateTicketChecklistInput,
  ): Promise<TicketChecklistResponse> {
    await this.requireWritableTicketContext(
      context,
      organizationId,
      projectId,
      ticketId,
    );
    const model = await this.workflowRepository.renameChecklist({
      organizationId,
      projectId,
      ticketId,
      checklistId,
      title: input.title,
    });
    if (!model) {
      throw new TicketChecklistNotFoundError();
    }
    return toTicketChecklistResponse(model.checklist, model.items);
  }

  async removeChecklist(
    context: OrganizationActorContext,
    organizationId: string,
    projectId: string,
    ticketId: string,
    checklistId: string,
  ): Promise<void> {
    await this.requireWritableTicketContext(
      context,
      organizationId,
      projectId,
      ticketId,
    );
    const removed = await this.workflowRepository.removeChecklist({
      organizationId,
      projectId,
      ticketId,
      checklistId,
    });
    if (!removed) {
      throw new TicketChecklistNotFoundError();
    }
  }

  async addChecklistItem(
    context: OrganizationActorContext,
    organizationId: string,
    projectId: string,
    ticketId: string,
    checklistId: string,
    input: CreateTicketChecklistItemInput,
  ): Promise<TicketChecklistItemResponse> {
    await this.requireWritableTicketContext(
      context,
      organizationId,
      projectId,
      ticketId,
    );
    const item = await this.workflowRepository.addChecklistItem({
      organizationId,
      projectId,
      ticketId,
      checklistId,
      title: input.title,
    });
    if (!item) {
      throw new TicketChecklistNotFoundError();
    }
    return toTicketChecklistItemResponse(item);
  }

  async updateChecklistItem(
    context: OrganizationActorContext,
    organizationId: string,
    projectId: string,
    ticketId: string,
    checklistId: string,
    itemId: string,
    input: UpdateTicketChecklistItemInput,
  ): Promise<TicketChecklistItemResponse> {
    await this.requireWritableTicketContext(
      context,
      organizationId,
      projectId,
      ticketId,
    );

    let item;
    if (input.title !== undefined) {
      item = await this.workflowRepository.renameChecklistItem({
        organizationId,
        projectId,
        ticketId,
        checklistId,
        itemId,
        title: input.title,
      });
    } else if (input.completed !== undefined) {
      item = await this.workflowRepository.toggleChecklistItem({
        organizationId,
        projectId,
        ticketId,
        checklistId,
        itemId,
        completed: input.completed,
      });
    } else {
      throw new Error('검증된 체크리스트 항목 변경 입력이 없습니다.');
    }
    if (!item) {
      throw new TicketChecklistItemNotFoundError();
    }
    return toTicketChecklistItemResponse(item);
  }

  async moveChecklistItem(
    context: OrganizationActorContext,
    organizationId: string,
    projectId: string,
    ticketId: string,
    checklistId: string,
    itemId: string,
    input: MoveTicketChecklistItemInput,
  ): Promise<MoveTicketChecklistItemResponse> {
    await this.requireWritableTicketContext(
      context,
      organizationId,
      projectId,
      ticketId,
    );
    const result = await this.workflowRepository.moveChecklistItem({
      organizationId,
      projectId,
      ticketId,
      checklistId,
      itemId,
      beforeItemId: input.beforeItemId ?? null,
      afterItemId: input.afterItemId ?? null,
    });

    switch (result.kind) {
      case 'project_not_found':
        throw new ProjectNotFoundError();
      case 'ticket_not_found':
        throw new TicketNotFoundError();
      case 'checklist_not_found':
        throw new TicketChecklistNotFoundError();
      case 'item_not_found':
        throw new TicketChecklistItemNotFoundError();
      case 'reference_not_found':
        throw new TicketChecklistMoveReferenceInvalidError();
      case 'moved':
        return {
          itemId: result.item.id,
          checklistId: result.item.checklistId,
          position: result.item.position,
          updatedAt: result.item.updatedAt.toISOString(),
        };
    }
  }

  async removeChecklistItem(
    context: OrganizationActorContext,
    organizationId: string,
    projectId: string,
    ticketId: string,
    checklistId: string,
    itemId: string,
  ): Promise<void> {
    await this.requireWritableTicketContext(
      context,
      organizationId,
      projectId,
      ticketId,
    );
    const removed = await this.workflowRepository.removeChecklistItem({
      organizationId,
      projectId,
      ticketId,
      checklistId,
      itemId,
    });
    if (!removed) {
      throw new TicketChecklistItemNotFoundError();
    }
  }

  async listComments(
    context: OrganizationActorContext,
    organizationId: string,
    projectId: string,
    ticketId: string,
  ): Promise<TicketCommentListResponse> {
    await this.organizationMembership.requireAccess(context, organizationId);
    await this.resourceLoader.requireProject(organizationId, projectId);
    await this.resourceLoader.requireTicket(
      organizationId,
      projectId,
      ticketId,
    );
    const comments = await this.workflowRepository.listComments(
      organizationId,
      projectId,
      ticketId,
    );
    if (!comments) {
      throw new TicketNotFoundError();
    }
    return { items: await this.toCommentResponses(comments) };
  }

  async createComment(
    context: OrganizationActorContext,
    organizationId: string,
    projectId: string,
    ticketId: string,
    input: CreateTicketCommentInput,
  ): Promise<TicketCommentResponse> {
    await this.requireWritableTicketContext(
      context,
      organizationId,
      projectId,
      ticketId,
    );
    const comment = await this.workflowRepository.createComment({
      organizationId,
      projectId,
      ticketId,
      authorUserId: context.userId,
      contentMarkdown: input.contentMarkdown,
    });
    if (!comment) {
      throw new TicketNotFoundError();
    }
    return this.toSingleCommentResponse(comment);
  }

  async updateComment(
    context: OrganizationActorContext,
    organizationId: string,
    projectId: string,
    ticketId: string,
    commentId: string,
    input: UpdateTicketCommentInput,
  ): Promise<TicketCommentResponse> {
    await this.requireWritableTicketContext(
      context,
      organizationId,
      projectId,
      ticketId,
    );
    await this.assertCommentAuthor(
      context.userId,
      organizationId,
      projectId,
      ticketId,
      commentId,
    );
    const comment = await this.workflowRepository.updateComment({
      organizationId,
      projectId,
      ticketId,
      commentId,
      contentMarkdown: input.contentMarkdown,
    });
    if (!comment) {
      throw new TicketCommentNotFoundError();
    }
    return this.toSingleCommentResponse(comment);
  }

  async removeComment(
    context: OrganizationActorContext,
    organizationId: string,
    projectId: string,
    ticketId: string,
    commentId: string,
  ): Promise<void> {
    await this.requireWritableTicketContext(
      context,
      organizationId,
      projectId,
      ticketId,
    );
    await this.assertCommentAuthor(
      context.userId,
      organizationId,
      projectId,
      ticketId,
      commentId,
    );
    const removed = await this.workflowRepository.removeComment({
      organizationId,
      projectId,
      ticketId,
      commentId,
    });
    if (!removed) {
      throw new TicketCommentNotFoundError();
    }
  }

  private async requireWritableProjectContext(
    context: OrganizationActorContext,
    organizationId: string,
    projectId: string,
  ) {
    await this.organizationMembership.requireAccess(context, organizationId);
    const project = await this.resourceLoader.requireProject(
      organizationId,
      projectId,
    );
    this.resourceLoader.assertProjectWritable(project);
    return project;
  }

  private async requireWritableTicketContext(
    context: OrganizationActorContext,
    organizationId: string,
    projectId: string,
    ticketId: string,
  ): Promise<Ticket> {
    await this.requireWritableProjectContext(
      context,
      organizationId,
      projectId,
    );
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

  private async assertCommentAuthor(
    actorUserId: string,
    organizationId: string,
    projectId: string,
    ticketId: string,
    commentId: string,
  ): Promise<void> {
    const comment = await this.workflowRepository.findComment(
      organizationId,
      projectId,
      ticketId,
      commentId,
    );
    if (!comment) {
      throw new TicketCommentNotFoundError();
    }
    if (comment.authorUserId !== actorUserId) {
      throw new TicketCommentAuthorRequiredError();
    }
  }

  private async toSingleCommentResponse(
    comment: TicketComment,
  ): Promise<TicketCommentResponse> {
    const [response] = await this.toCommentResponses([comment]);
    if (!response) {
      throw new Error('티켓 댓글 projection 결과가 없습니다.');
    }
    return response;
  }

  private async toCommentResponses(
    comments: readonly TicketComment[],
  ): Promise<TicketCommentResponse[]> {
    const usersById = await this.loadUsersById(
      comments.map(({ authorUserId }) => authorUserId),
    );
    return comments.map((comment) => {
      const author = usersById.get(comment.authorUserId);
      if (!author) {
        throw new Error('티켓 댓글 작성자 사용자 정보를 조회할 수 없습니다.');
      }
      return toTicketCommentResponse(comment, author);
    });
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
}
