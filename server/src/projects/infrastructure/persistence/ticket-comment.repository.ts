import type { TicketComment } from '@/projects/domain/ticket-comment';
import type { CreateTicketCommentInput } from '@/projects/dto/create-ticket-comment.dto';
import type { UpdateTicketCommentInput } from '@/projects/dto/update-ticket-comment.dto';

export abstract class TicketCommentRepository {
  abstract listComments(
    organizationId: string,
    projectId: string,
    ticketId: string,
  ): Promise<TicketComment[] | null>;

  abstract findComment(
    organizationId: string,
    projectId: string,
    ticketId: string,
    commentId: string,
  ): Promise<TicketComment | null>;

  abstract createComment(
    organizationId: string,
    projectId: string,
    ticketId: string,
    authorUserId: string,
    input: CreateTicketCommentInput,
  ): Promise<TicketComment | null>;

  abstract updateComment(
    organizationId: string,
    projectId: string,
    ticketId: string,
    commentId: string,
    input: UpdateTicketCommentInput,
  ): Promise<TicketComment | null>;

  abstract removeComment(
    organizationId: string,
    projectId: string,
    ticketId: string,
    commentId: string,
  ): Promise<boolean>;
}
