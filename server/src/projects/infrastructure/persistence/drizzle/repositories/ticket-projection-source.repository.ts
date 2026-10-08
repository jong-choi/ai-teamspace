import { Injectable } from '@nestjs/common';

import { DatabaseService } from '@/database/database.service';
import { TicketProjectionSourceSchema } from '@/projects/domain/ticket-projection-source';
import { ticket } from '@/projects/infrastructure/persistence/drizzle/schema/ticket.schema';
import { ticketChecklist } from '@/projects/infrastructure/persistence/drizzle/schema/ticket-checklist.schema';
import { ticketChecklistItem } from '@/projects/infrastructure/persistence/drizzle/schema/ticket-checklist-item.schema';
import { ticketLabel } from '@/projects/infrastructure/persistence/drizzle/schema/ticket-label.schema';
import { ticketLabelAssignment } from '@/projects/infrastructure/persistence/drizzle/schema/ticket-label-assignment.schema';
import { TicketProjectionSourceRepository } from '@/projects/infrastructure/persistence/ticket-projection-source.repository';

import { and, asc, eq, gt, inArray } from 'drizzle-orm';

@Injectable()
export class TicketProjectionSourceDrizzleRepository extends TicketProjectionSourceRepository {
  constructor(private readonly database: DatabaseService) {
    super();
  }

  async current(organizationId: string, ticketId: string) {
    return this.database.db.transaction(
      async (transaction) => {
        const [source] = await transaction
          .select({
            id: ticket.id,
            organizationId: ticket.organizationId,
            projectId: ticket.projectId,
            columnId: ticket.columnId,
            number: ticket.number,
            title: ticket.title,
            priority: ticket.priority,
            assigneeUserId: ticket.assigneeUserId,
            reporterUserId: ticket.reporterUserId,
            position: ticket.position,
            dueAt: ticket.dueAt,
            archivedAt: ticket.archivedAt,
            updatedAt: ticket.updatedAt,
          })
          .from(ticket)
          .where(
            and(
              eq(ticket.organizationId, organizationId),
              eq(ticket.id, ticketId),
            ),
          )
          .limit(1);
        if (!source) return null;

        const [labels, checklists] = await Promise.all([
          transaction
            .select({
              id: ticketLabel.id,
              projectId: ticketLabel.projectId,
              name: ticketLabel.name,
              color: ticketLabel.color,
            })
            .from(ticketLabelAssignment)
            .innerJoin(
              ticketLabel,
              eq(ticketLabel.id, ticketLabelAssignment.labelId),
            )
            .where(
              and(
                eq(ticketLabelAssignment.ticketId, ticketId),
                eq(ticketLabel.projectId, source.projectId),
              ),
            )
            .orderBy(asc(ticketLabel.name), asc(ticketLabel.id)),
          transaction
            .select({
              id: ticketChecklist.id,
              title: ticketChecklist.title,
              position: ticketChecklist.position,
            })
            .from(ticketChecklist)
            .where(eq(ticketChecklist.ticketId, ticketId))
            .orderBy(asc(ticketChecklist.position), asc(ticketChecklist.id)),
        ]);

        const checklistIds = checklists.map(({ id }) => id);
        const items =
          checklistIds.length === 0
            ? []
            : await transaction
                .select({
                  id: ticketChecklistItem.id,
                  checklistId: ticketChecklistItem.checklistId,
                  title: ticketChecklistItem.title,
                  completed: ticketChecklistItem.completed,
                  position: ticketChecklistItem.position,
                })
                .from(ticketChecklistItem)
                .where(inArray(ticketChecklistItem.checklistId, checklistIds))
                .orderBy(
                  asc(ticketChecklistItem.checklistId),
                  asc(ticketChecklistItem.position),
                  asc(ticketChecklistItem.id),
                );

        return TicketProjectionSourceSchema.parse({
          ...source,
          labels,
          checklists: checklists.map((checklist) => ({
            ...checklist,
            items: items.filter((item) => item.checklistId === checklist.id),
          })),
        });
      },
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    );
  }
  async listIds(organizationId: string, afterId: string | null, limit: number) {
    return this.database.db
      .select({ id: ticket.id })
      .from(ticket)
      .where(
        and(
          eq(ticket.organizationId, organizationId),
          afterId ? gt(ticket.id, afterId) : undefined,
        ),
      )
      .orderBy(asc(ticket.id))
      .limit(limit);
  }
}
