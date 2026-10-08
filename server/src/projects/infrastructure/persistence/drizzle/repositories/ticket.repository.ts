import { Injectable } from '@nestjs/common';

import { DatabaseService } from '@/database/database.service';
import { OutboxAggregateChangePublisher } from '@/outbox/outbox-aggregate-change.publisher';
import type { Ticket } from '@/projects/domain/ticket';
import type { CreateTicketInput } from '@/projects/dto/create-ticket.dto';
import type { QueryTicketsInput } from '@/projects/dto/query-tickets.dto';
import type { UpdateTicketInput } from '@/projects/dto/update-ticket.dto';
import { toProjectUpdate } from '@/projects/infrastructure/persistence/drizzle/mappers/project.mapper';
import {
  toTicketDomain,
  toTicketInsert,
  toTicketUpdate,
} from '@/projects/infrastructure/persistence/drizzle/mappers/ticket.mapper';
import { project } from '@/projects/infrastructure/persistence/drizzle/schema/project.schema';
import { projectColumn } from '@/projects/infrastructure/persistence/drizzle/schema/project-column.schema';
import { ticket } from '@/projects/infrastructure/persistence/drizzle/schema/ticket.schema';
import {
  type CreateTicketResult,
  TicketRepository,
} from '@/projects/infrastructure/persistence/ticket.repository';

import { and, asc, eq, ilike, isNull, max, or } from 'drizzle-orm';

type TicketTransaction = Parameters<
  Parameters<DatabaseService['db']['transaction']>[0]
>[0];

@Injectable()
export class TicketDrizzleRepository extends TicketRepository {
  constructor(
    private readonly database: DatabaseService,
    private readonly graphEvents: OutboxAggregateChangePublisher,
  ) {
    super();
  }

  async listTickets(
    organizationId: string,
    projectId: string,
    input: QueryTicketsInput,
  ): Promise<Ticket[]> {
    const search = input.search?.trim();
    const searchCondition = search
      ? or(
          ilike(ticket.title, `%${escapeLikePattern(search)}%`),
          ilike(ticket.descriptionMarkdown, `%${escapeLikePattern(search)}%`),
        )
      : undefined;
    const rows = await this.database.db
      .select()
      .from(ticket)
      .where(
        and(
          eq(ticket.organizationId, organizationId),
          eq(ticket.projectId, projectId),
          isNull(ticket.archivedAt),
          input.columnId ? eq(ticket.columnId, input.columnId) : undefined,
          input.assigneeUserId
            ? eq(ticket.assigneeUserId, input.assigneeUserId)
            : undefined,
          input.priority ? eq(ticket.priority, input.priority) : undefined,
          searchCondition,
        ),
      )
      .orderBy(asc(ticket.position), asc(ticket.id));
    return rows.map(toTicketDomain);
  }

  async findTicketById(
    organizationId: string,
    projectId: string,
    ticketId: string,
  ): Promise<Ticket | null> {
    const [row] = await this.database.db
      .select()
      .from(ticket)
      .where(
        and(
          eq(ticket.id, ticketId),
          eq(ticket.organizationId, organizationId),
          eq(ticket.projectId, projectId),
        ),
      )
      .limit(1);
    return row ? toTicketDomain(row) : null;
  }

  async createTicketWithNumber(
    organizationId: string,
    projectId: string,
    reporterUserId: string,
    input: CreateTicketInput,
  ): Promise<CreateTicketResult> {
    return this.database.db.transaction(async (transaction) => {
      const [projectRow] = await transaction
        .select()
        .from(project)
        .where(
          and(
            eq(project.id, projectId),
            eq(project.organizationId, organizationId),
            isNull(project.archivedAt),
          ),
        )
        .for('update')
        .limit(1);
      if (!projectRow) return { kind: 'project_not_found' };

      const [columnRow] = await transaction
        .select({ id: projectColumn.id })
        .from(projectColumn)
        .where(
          and(
            eq(projectColumn.id, input.columnId),
            eq(projectColumn.projectId, projectId),
          ),
        )
        .limit(1);
      if (!columnRow) return { kind: 'column_not_found' };

      const [positionRow] = await transaction
        .select({ position: max(ticket.position) })
        .from(ticket)
        .where(
          and(
            eq(ticket.projectId, projectId),
            eq(ticket.columnId, input.columnId),
            isNull(ticket.archivedAt),
          ),
        );
      const now = new Date();
      await transaction
        .update(project)
        .set(
          toProjectUpdate({
            nextTicketNumber: projectRow.nextTicketNumber + 1,
            updatedAt: now,
          }),
        )
        .where(eq(project.id, projectId));

      const [row] = await transaction
        .insert(ticket)
        .values(
          toTicketInsert({
            organizationId,
            projectId,
            columnId: input.columnId,
            number: projectRow.nextTicketNumber,
            title: input.title,
            descriptionMarkdown: input.descriptionMarkdown ?? '',
            priority: input.priority ?? 'medium',
            assigneeUserId: input.assigneeUserId ?? null,
            reporterUserId,
            position: (positionRow?.position ?? -1) + 1,
            dueAt: input.dueAt ? new Date(input.dueAt) : null,
            updatedAt: now,
          }),
        )
        .returning();
      if (!row) throw new Error('티켓 생성 결과가 없습니다.');
      await this.graphEvents.ticketChanged(
        transaction,
        organizationId,
        row.id,
        'changed',
      );
      return { kind: 'created', ticket: toTicketDomain(row) };
    });
  }

  async updateTicket(
    organizationId: string,
    projectId: string,
    ticketId: string,
    input: UpdateTicketInput,
  ): Promise<Ticket | null> {
    return this.database.db.transaction(async (transaction) => {
      const [projectRow] = await transaction
        .select({ id: project.id })
        .from(project)
        .where(
          and(
            eq(project.id, projectId),
            eq(project.organizationId, organizationId),
            isNull(project.archivedAt),
          ),
        )
        .for('update')
        .limit(1);
      if (!projectRow) return null;

      const [current] = await transaction
        .select()
        .from(ticket)
        .where(
          and(
            eq(ticket.id, ticketId),
            eq(ticket.organizationId, organizationId),
            eq(ticket.projectId, projectId),
          ),
        )
        .for('update')
        .limit(1);
      if (!current) return null;

      const now = new Date();
      const archivedAt =
        input.archived === undefined
          ? undefined
          : input.archived
            ? new Date()
            : null;
      const restoring =
        archivedAt === null &&
        current.archivedAt !== null &&
        input.title === undefined &&
        input.descriptionMarkdown === undefined &&
        input.priority === undefined &&
        input.assigneeUserId === undefined &&
        input.dueAt === undefined;
      if (current.archivedAt !== null && !restoring) return null;

      let position = current.position;
      if (restoring) {
        const [positionRow] = await transaction
          .select({ position: max(ticket.position) })
          .from(ticket)
          .where(
            and(
              eq(ticket.organizationId, organizationId),
              eq(ticket.projectId, projectId),
              eq(ticket.columnId, current.columnId),
              isNull(ticket.archivedAt),
            ),
          );
        position = (positionRow?.position ?? -1) + 1;
      }

      const [row] = await transaction
        .update(ticket)
        .set(
          toTicketUpdate({
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
            archivedAt,
            position,
            updatedAt: now,
          }),
        )
        .where(eq(ticket.id, ticketId))
        .returning();
      if (!row) throw new Error('티켓 보관 상태 변경 결과가 없습니다.');

      if (
        archivedAt !== undefined &&
        archivedAt !== null &&
        current.archivedAt === null
      ) {
        await normalizeActiveTicketOrder(
          transaction,
          organizationId,
          projectId,
          current.columnId,
          now,
        );
      }
      await this.graphEvents.ticketChanged(
        transaction,
        organizationId,
        ticketId,
        'changed',
      );
      await transaction
        .update(project)
        .set(toProjectUpdate({ updatedAt: now }))
        .where(
          and(
            eq(project.id, projectId),
            eq(project.organizationId, organizationId),
          ),
        );
      return toTicketDomain(row);
    });
  }
}

async function normalizeActiveTicketOrder(
  transaction: TicketTransaction,
  organizationId: string,
  projectId: string,
  columnId: string,
  updatedAt: Date,
): Promise<void> {
  const rows = await transaction
    .select()
    .from(ticket)
    .where(
      and(
        eq(ticket.organizationId, organizationId),
        eq(ticket.projectId, projectId),
        eq(ticket.columnId, columnId),
        isNull(ticket.archivedAt),
      ),
    )
    .orderBy(asc(ticket.position), asc(ticket.id))
    .for('update');
  for (const [position, row] of rows.entries()) {
    if (row.position === position) continue;
    await transaction
      .update(ticket)
      .set(toTicketUpdate({ position, updatedAt }))
      .where(
        and(
          eq(ticket.id, row.id),
          eq(ticket.organizationId, organizationId),
          eq(ticket.projectId, projectId),
        ),
      );
  }
}

function escapeLikePattern(value: string): string {
  return value
    .replaceAll('\\', '\\\\')
    .replaceAll('%', '\\%')
    .replaceAll('_', '\\_');
}
