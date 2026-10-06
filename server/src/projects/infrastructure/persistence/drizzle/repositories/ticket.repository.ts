import { Injectable } from '@nestjs/common';

import { DatabaseService } from '@/database/database.service';
import type { Ticket } from '@/projects/domain/ticket';
import { toProjectUpdate } from '@/projects/infrastructure/persistence/drizzle/mappers/project.mapper';
import {
  toTicketDomain,
  toTicketInsert,
  toTicketUpdate,
} from '@/projects/infrastructure/persistence/drizzle/mappers/ticket.mapper';
import { projectColumn } from '@/projects/infrastructure/persistence/drizzle/schema/project-column.schema';
import { project } from '@/projects/infrastructure/persistence/drizzle/schema/project.schema';
import { ticket } from '@/projects/infrastructure/persistence/drizzle/schema/ticket.schema';
import {
  type CreateTicketPersistenceInput,
  type CreateTicketResult,
  type ListTicketsPersistenceInput,
  type TicketChanges,
  TicketRepository,
} from '@/projects/infrastructure/persistence/ticket.repository';

import { and, asc, eq, ilike, isNull, max, or } from 'drizzle-orm';

type TicketTransaction = Parameters<
  Parameters<DatabaseService['db']['transaction']>[0]
>[0];

@Injectable()
export class TicketDrizzleRepository extends TicketRepository {
  constructor(private readonly database: DatabaseService) {
    super();
  }

  async listTickets(input: ListTicketsPersistenceInput): Promise<Ticket[]> {
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
          eq(ticket.organizationId, input.organizationId),
          eq(ticket.projectId, input.projectId),
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
    input: CreateTicketPersistenceInput,
  ): Promise<CreateTicketResult> {
    return this.database.db.transaction(async (transaction) => {
      const [projectRow] = await transaction
        .select()
        .from(project)
        .where(
          and(
            eq(project.id, input.projectId),
            eq(project.organizationId, input.organizationId),
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
            eq(projectColumn.projectId, input.projectId),
          ),
        )
        .limit(1);
      if (!columnRow) return { kind: 'column_not_found' };

      const [positionRow] = await transaction
        .select({ position: max(ticket.position) })
        .from(ticket)
        .where(
          and(
            eq(ticket.projectId, input.projectId),
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
        .where(eq(project.id, input.projectId));

      const [row] = await transaction
        .insert(ticket)
        .values(
          toTicketInsert({
            organizationId: input.organizationId,
            projectId: input.projectId,
            columnId: input.columnId,
            number: projectRow.nextTicketNumber,
            title: input.title,
            descriptionMarkdown: input.descriptionMarkdown,
            priority: input.priority,
            assigneeUserId: input.assigneeUserId,
            reporterUserId: input.reporterUserId,
            position: (positionRow?.position ?? -1) + 1,
            dueAt: input.dueAt,
            updatedAt: now,
          }),
        )
        .returning();
      if (!row) throw new Error('티켓 생성 결과가 없습니다.');
      return { kind: 'created', ticket: toTicketDomain(row) };
    });
  }

  async updateTicket(input: {
    organizationId: string;
    projectId: string;
    ticketId: string;
    changes: TicketChanges;
  }): Promise<Ticket | null> {
    return this.database.db.transaction(async (transaction) => {
      const [projectRow] = await transaction
        .select({ id: project.id })
        .from(project)
        .where(
          and(
            eq(project.id, input.projectId),
            eq(project.organizationId, input.organizationId),
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
            eq(ticket.id, input.ticketId),
            eq(ticket.organizationId, input.organizationId),
            eq(ticket.projectId, input.projectId),
          ),
        )
        .for('update')
        .limit(1);
      if (!current) return null;

      const now = new Date();
      const archivedAt = input.changes.archivedAt;
      const restoring =
        archivedAt === null &&
        current.archivedAt !== null &&
        Object.entries(input.changes).filter(([, value]) => value !== undefined)
          .length === 1;
      if (current.archivedAt !== null && !restoring) return null;

      let position = current.position;
      if (restoring) {
        const [positionRow] = await transaction
          .select({ position: max(ticket.position) })
          .from(ticket)
          .where(
            and(
              eq(ticket.organizationId, input.organizationId),
              eq(ticket.projectId, input.projectId),
              eq(ticket.columnId, current.columnId),
              isNull(ticket.archivedAt),
            ),
          );
        position = (positionRow?.position ?? -1) + 1;
      }

      const [row] = await transaction
        .update(ticket)
        .set(toTicketUpdate({ ...input.changes, position, updatedAt: now }))
        .where(eq(ticket.id, input.ticketId))
        .returning();
      if (!row) throw new Error('티켓 보관 상태 변경 결과가 없습니다.');

      if (
        archivedAt !== undefined &&
        archivedAt !== null &&
        current.archivedAt === null
      ) {
        await normalizeActiveTicketOrder(
          transaction,
          input.organizationId,
          input.projectId,
          current.columnId,
          now,
        );
      }
      await transaction
        .update(project)
        .set(toProjectUpdate({ updatedAt: now }))
        .where(
          and(
            eq(project.id, input.projectId),
            eq(project.organizationId, input.organizationId),
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
