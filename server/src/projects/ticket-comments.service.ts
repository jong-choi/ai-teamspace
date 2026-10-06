import { Injectable } from '@nestjs/common';

import type { OrganizationActorContext } from '@/organizations/organization-actor-context';
import {
  TicketCommentAuthorRequiredError,
  TicketCommentNotFoundError,
  TicketNotFoundError,
} from '@/projects/domain/project.error';
import type { TicketComment } from '@/projects/domain/ticket-comment';
import type { CreateTicketCommentInput } from '@/projects/dto/create-ticket-comment.dto';
import {
  type TicketCommentListResponse,
  type TicketCommentResponse,
  toTicketCommentResponse,
} from '@/projects/dto/ticket-comment.dto';
import type { UpdateTicketCommentInput } from '@/projects/dto/update-ticket-comment.dto';
import { TicketWorkflowRepository } from '@/projects/infrastructure/persistence/ticket-workflow.repository';
import { ProjectUserResolver } from '@/projects/project-user.resolver';
import { TicketWorkflowAccessPolicy } from '@/projects/ticket-workflow-access.policy';

@Injectable()
export class TicketCommentsService {
  constructor(
    private readonly workflowRepository: TicketWorkflowRepository,
    private readonly accessPolicy: TicketWorkflowAccessPolicy,
    private readonly userResolver: ProjectUserResolver,
  ) {}

  async listComments(
    context: OrganizationActorContext,
    organizationId: string,
    projectId: string,
    ticketId: string,
  ): Promise<TicketCommentListResponse> {
    await this.accessPolicy.requireReadableTicket(
      context,
      organizationId,
      projectId,
      ticketId,
    );
    const comments = await this.workflowRepository.listComments(
      organizationId,
      projectId,
      ticketId,
    );
    if (!comments) throw new TicketNotFoundError();
    return { items: await this.toCommentResponses(comments) };
  }

  async createComment(
    context: OrganizationActorContext,
    organizationId: string,
    projectId: string,
    ticketId: string,
    input: CreateTicketCommentInput,
  ): Promise<TicketCommentResponse> {
    await this.accessPolicy.requireWritableTicket(
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
    if (!comment) throw new TicketNotFoundError();
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
    await this.accessPolicy.requireWritableTicket(
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
    if (!comment) throw new TicketCommentNotFoundError();
    return this.toSingleCommentResponse(comment);
  }

  async removeComment(
    context: OrganizationActorContext,
    organizationId: string,
    projectId: string,
    ticketId: string,
    commentId: string,
  ): Promise<void> {
    await this.accessPolicy.requireWritableTicket(
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
    if (!removed) throw new TicketCommentNotFoundError();
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
    if (!comment) throw new TicketCommentNotFoundError();
    if (comment.authorUserId !== actorUserId) {
      throw new TicketCommentAuthorRequiredError();
    }
  }

  private async toSingleCommentResponse(
    comment: TicketComment,
  ): Promise<TicketCommentResponse> {
    const [response] = await this.toCommentResponses([comment]);
    if (!response) throw new Error('티켓 댓글 projection 결과가 없습니다.');
    return response;
  }

  private async toCommentResponses(
    comments: readonly TicketComment[],
  ): Promise<TicketCommentResponse[]> {
    const usersById = await this.userResolver.findByIds(
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
}
