import { Injectable } from '@nestjs/common';

import { DatabaseService } from '@/database/database.service';
import { OutboxAggregateChangePublisher } from '@/outbox/outbox-aggregate-change.publisher';
import type { Ticket } from '@/projects/domain/ticket';
import type { MoveTicketInput } from '@/projects/dto/move-ticket.dto';
import { toTicketDomain } from '@/projects/infrastructure/persistence/drizzle/mappers/ticket.mapper';
import {
  lockActiveProject,
  persistTicketOrder,
  resolveInsertionIndex,
  touchProject,
} from '@/projects/infrastructure/persistence/drizzle/repositories/ticket-workflow.helpers';
import { projectColumn } from '@/projects/infrastructure/persistence/drizzle/schema/project-column.schema';
import { ticket } from '@/projects/infrastructure/persistence/drizzle/schema/ticket.schema';
import {
  type MoveTicketResult,
  TicketOrderingRepository,
} from '@/projects/infrastructure/persistence/ticket-ordering.repository';

import { and, asc, eq, isNull } from 'drizzle-orm';

@Injectable()
export class TicketOrderingDrizzleRepository extends TicketOrderingRepository {
  constructor(
    private readonly database: DatabaseService,
    private readonly graphEvents: OutboxAggregateChangePublisher,
  ) {
    super();
  }

  async moveTicket(
    organizationId: string,
    projectId: string,
    ticketId: string,
    input: MoveTicketInput,
  ): Promise<MoveTicketResult> {
    return this.database.db.transaction(async (transaction) => {
      if (!(await lockActiveProject(transaction, organizationId, projectId))) {
        return { kind: 'project_not_found' };
      }

      const [sourceTicket] = await transaction
        .select()
        .from(ticket)
        .where(
          and(
            eq(ticket.id, ticketId),
            eq(ticket.organizationId, organizationId),
            eq(ticket.projectId, projectId),
            isNull(ticket.archivedAt),
          ),
        )
        .for('update')
        .limit(1);
      if (!sourceTicket) {
        return { kind: 'ticket_not_found' };
      }

      const [targetColumn] = await transaction
        .select({ id: projectColumn.id })
        .from(projectColumn)
        .where(
          and(
            eq(projectColumn.id, input.targetColumnId),
            eq(projectColumn.projectId, projectId),
          ),
        )
        .limit(1);
      if (!targetColumn) {
        return { kind: 'column_not_found' };
      }

      const sourceRows = await transaction
        .select()
        .from(ticket)
        .where(
          and(
            eq(ticket.organizationId, organizationId),
            eq(ticket.projectId, projectId),
            eq(ticket.columnId, sourceTicket.columnId),
            isNull(ticket.archivedAt),
          ),
        )
        .orderBy(asc(ticket.position), asc(ticket.id))
        .for('update');
      const targetRows =
        sourceTicket.columnId === input.targetColumnId
          ? sourceRows
          : await transaction
              .select()
              .from(ticket)
              .where(
                and(
                  eq(ticket.organizationId, organizationId),
                  eq(ticket.projectId, projectId),
                  eq(ticket.columnId, input.targetColumnId),
                  isNull(ticket.archivedAt),
                ),
              )
              .orderBy(asc(ticket.position), asc(ticket.id))
              .for('update');

      const targetWithoutSource = targetRows.filter(
        ({ id }) => id !== ticketId,
      );
      const insertionIndex = resolveInsertionIndex(
        targetWithoutSource,
        input.beforeTicketId ?? null,
        input.afterTicketId ?? null,
      );
      if (insertionIndex === null) {
        return { kind: 'reference_not_found' };
      }

      const finalTargetOrder = [...targetWithoutSource];
      finalTargetOrder.splice(insertionIndex, 0, sourceTicket);
      const now = new Date();
      let movedTicket: Ticket = toTicketDomain(sourceTicket);
      let changed = false;

      if (sourceTicket.columnId === input.targetColumnId) {
        const result = await persistTicketOrder(
          transaction,
          input.targetColumnId,
          finalTargetOrder,
          now,
          ticketId,
        );
        movedTicket = result.focus ?? movedTicket;
        changed = result.changed;
      } else {
        const finalSourceOrder = sourceRows.filter(
          ({ id }) => id !== sourceTicket.id,
        );
        const sourceResult = await persistTicketOrder(
          transaction,
          sourceTicket.columnId,
          finalSourceOrder,
          now,
          ticketId,
        );
        const targetResult = await persistTicketOrder(
          transaction,
          input.targetColumnId,
          finalTargetOrder,
          now,
          ticketId,
        );
        movedTicket = targetResult.focus ?? movedTicket;
        changed = sourceResult.changed || targetResult.changed;
      }

      if (changed) {
        await touchProject(transaction, projectId, now);
        await this.graphEvents.ticketChanged(
          transaction,
          organizationId,
          ticketId,
          'changed',
        );
      }
      return { kind: 'moved', ticket: movedTicket };
    });
  }
}
