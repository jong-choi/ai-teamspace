import { Injectable } from '@nestjs/common';

import { DatabaseService } from '@/database/database.service';
import type { TicketComment } from '@/projects/domain/ticket-comment';
import type { CreateTicketCommentInput } from '@/projects/dto/create-ticket-comment.dto';
import type { UpdateTicketCommentInput } from '@/projects/dto/update-ticket-comment.dto';
import {
  toTicketCommentDomain,
  toTicketCommentInsert,
  toTicketCommentUpdate,
} from '@/projects/infrastructure/persistence/drizzle/mappers/ticket-comment.mapper';
import {
  lockActiveTicket,
  touchProject,
} from '@/projects/infrastructure/persistence/drizzle/repositories/ticket-workflow.helpers';
import { ticket } from '@/projects/infrastructure/persistence/drizzle/schema/ticket.schema';
import { ticketComment } from '@/projects/infrastructure/persistence/drizzle/schema/ticket-comment.schema';
import { TicketCommentRepository } from '@/projects/infrastructure/persistence/ticket-comment.repository';

import { and, asc, eq } from 'drizzle-orm';

@Injectable()
export class TicketCommentDrizzleRepository extends TicketCommentRepository {
  constructor(private readonly database: DatabaseService) {
    super();
  }

  async listComments(
    organizationId: string,
    projectId: string,
    ticketId: string,
  ): Promise<TicketComment[] | null> {
    if (!(await this.ticketExists(organizationId, projectId, ticketId))) {
      return null;
    }
    const rows = await this.database.db
      .select()
      .from(ticketComment)
      .where(eq(ticketComment.ticketId, ticketId))
      .orderBy(asc(ticketComment.createdAt), asc(ticketComment.id));
    return rows.map(toTicketCommentDomain);
  }

  async findComment(
    organizationId: string,
    projectId: string,
    ticketId: string,
    commentId: string,
  ): Promise<TicketComment | null> {
    if (!(await this.ticketExists(organizationId, projectId, ticketId))) {
      return null;
    }
    const [row] = await this.database.db
      .select()
      .from(ticketComment)
      .where(
        and(
          eq(ticketComment.id, commentId),
          eq(ticketComment.ticketId, ticketId),
        ),
      )
      .limit(1);
    return row ? toTicketCommentDomain(row) : null;
  }

  async createComment(
    organizationId: string,
    projectId: string,
    ticketId: string,
    authorUserId: string,
    input: CreateTicketCommentInput,
  ): Promise<TicketComment | null> {
    return this.database.db.transaction(async (transaction) => {
      if (
        !(await lockActiveTicket(
          transaction,
          organizationId,
          projectId,
          ticketId,
        ))
      ) {
        return null;
      }
      const now = new Date();
      const [row] = await transaction
        .insert(ticketComment)
        .values(
          toTicketCommentInsert({
            ticketId,
            authorUserId,
            contentMarkdown: input.contentMarkdown,
            updatedAt: now,
          }),
        )
        .returning();
      if (!row) {
        throw new Error('티켓 댓글 생성 결과가 없습니다.');
      }
      await touchProject(transaction, projectId, now);
      return toTicketCommentDomain(row);
    });
  }

  async updateComment(
    organizationId: string,
    projectId: string,
    ticketId: string,
    commentId: string,
    input: UpdateTicketCommentInput,
  ): Promise<TicketComment | null> {
    return this.database.db.transaction(async (transaction) => {
      if (
        !(await lockActiveTicket(
          transaction,
          organizationId,
          projectId,
          ticketId,
        ))
      ) {
        return null;
      }
      const now = new Date();
      const [row] = await transaction
        .update(ticketComment)
        .set(
          toTicketCommentUpdate({
            contentMarkdown: input.contentMarkdown,
            updatedAt: now,
          }),
        )
        .where(
          and(
            eq(ticketComment.id, commentId),
            eq(ticketComment.ticketId, ticketId),
          ),
        )
        .returning();
      if (!row) {
        return null;
      }
      await touchProject(transaction, projectId, now);
      return toTicketCommentDomain(row);
    });
  }

  async removeComment(
    organizationId: string,
    projectId: string,
    ticketId: string,
    commentId: string,
  ): Promise<boolean> {
    return this.database.db.transaction(async (transaction) => {
      if (
        !(await lockActiveTicket(
          transaction,
          organizationId,
          projectId,
          ticketId,
        ))
      ) {
        return false;
      }
      const [row] = await transaction
        .delete(ticketComment)
        .where(
          and(
            eq(ticketComment.id, commentId),
            eq(ticketComment.ticketId, ticketId),
          ),
        )
        .returning({ id: ticketComment.id });
      if (!row) {
        return false;
      }
      await touchProject(transaction, projectId, new Date());
      return true;
    });
  }

  private async ticketExists(
    organizationId: string,
    projectId: string,
    ticketId: string,
  ): Promise<boolean> {
    const [row] = await this.database.db
      .select({ id: ticket.id })
      .from(ticket)
      .where(
        and(
          eq(ticket.id, ticketId),
          eq(ticket.organizationId, organizationId),
          eq(ticket.projectId, projectId),
        ),
      )
      .limit(1);
    return row !== undefined;
  }
}
