import { Injectable } from '@nestjs/common';

import { DatabaseService } from '@/database/database.service';
import { OutboxAggregateChangePublisher } from '@/outbox/outbox-aggregate-change.publisher';
import type { TicketLabel } from '@/projects/domain/ticket-label';
import type { CreateTicketLabelInput } from '@/projects/dto/create-ticket-label.dto';
import type { UpdateTicketLabelInput } from '@/projects/dto/update-ticket-label.dto';
import {
  toTicketLabelDomain,
  toTicketLabelInsert,
  toTicketLabelUpdate,
} from '@/projects/infrastructure/persistence/drizzle/mappers/ticket-label.mapper';
import {
  lockActiveProject,
  lockActiveTicket,
  touchProject,
} from '@/projects/infrastructure/persistence/drizzle/repositories/ticket-workflow.helpers';
import { project } from '@/projects/infrastructure/persistence/drizzle/schema/project.schema';
import { ticketLabel } from '@/projects/infrastructure/persistence/drizzle/schema/ticket-label.schema';
import { ticketLabelAssignment } from '@/projects/infrastructure/persistence/drizzle/schema/ticket-label-assignment.schema';
import { TicketLabelRepository } from '@/projects/infrastructure/persistence/ticket-label.repository';

import { and, asc, eq } from 'drizzle-orm';

@Injectable()
export class TicketLabelDrizzleRepository extends TicketLabelRepository {
  constructor(
    private readonly database: DatabaseService,
    private readonly graphEvents: OutboxAggregateChangePublisher,
  ) {
    super();
  }

  async listLabels(
    organizationId: string,
    projectId: string,
  ): Promise<TicketLabel[]> {
    const rows = await this.database.db
      .select({ label: ticketLabel })
      .from(ticketLabel)
      .innerJoin(project, eq(project.id, ticketLabel.projectId))
      .where(
        and(
          eq(project.id, projectId),
          eq(project.organizationId, organizationId),
        ),
      )
      .orderBy(asc(ticketLabel.name), asc(ticketLabel.id));
    return rows.map(({ label }) => toTicketLabelDomain(label));
  }

  async createLabel(
    organizationId: string,
    projectId: string,
    input: CreateTicketLabelInput,
  ): Promise<TicketLabel | null> {
    return this.database.db.transaction(async (transaction) => {
      if (!(await lockActiveProject(transaction, organizationId, projectId))) {
        return null;
      }
      const now = new Date();
      const [row] = await transaction
        .insert(ticketLabel)
        .values(
          toTicketLabelInsert({
            projectId,
            name: input.name,
            color: input.color,
            updatedAt: now,
          }),
        )
        .returning();
      if (!row) {
        throw new Error('티켓 라벨 생성 결과가 없습니다.');
      }
      await touchProject(transaction, projectId, now, this.graphEvents);
      await this.graphEvents.ticketLabelChanged(
        transaction,
        organizationId,
        row.id,
        'changed',
      );
      return toTicketLabelDomain(row);
    });
  }

  async updateLabel(
    organizationId: string,
    projectId: string,
    labelId: string,
    input: UpdateTicketLabelInput,
  ): Promise<TicketLabel | null> {
    return this.database.db.transaction(async (transaction) => {
      if (!(await lockActiveProject(transaction, organizationId, projectId))) {
        return null;
      }
      const now = new Date();
      const [row] = await transaction
        .update(ticketLabel)
        .set(
          toTicketLabelUpdate({
            ...(input.name === undefined ? {} : { name: input.name }),
            ...(input.color === undefined ? {} : { color: input.color }),
            updatedAt: now,
          }),
        )
        .where(
          and(
            eq(ticketLabel.id, labelId),
            eq(ticketLabel.projectId, projectId),
          ),
        )
        .returning();
      if (!row) {
        return null;
      }
      await touchProject(transaction, projectId, now, this.graphEvents);
      await this.graphEvents.ticketLabelChanged(
        transaction,
        organizationId,
        row.id,
        'changed',
      );
      return toTicketLabelDomain(row);
    });
  }

  async attachLabel(
    organizationId: string,
    projectId: string,
    ticketId: string,
    labelId: string,
  ): Promise<TicketLabel | null> {
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
      const [labelRow] = await transaction
        .select()
        .from(ticketLabel)
        .where(
          and(
            eq(ticketLabel.id, labelId),
            eq(ticketLabel.projectId, projectId),
          ),
        )
        .limit(1);
      if (!labelRow) {
        return null;
      }
      const [assignment] = await transaction
        .insert(ticketLabelAssignment)
        .values({ ticketId, labelId })
        .onConflictDoNothing()
        .returning({ ticketId: ticketLabelAssignment.ticketId });
      if (assignment) {
        await touchProject(
          transaction,
          projectId,
          new Date(),
          this.graphEvents,
        );
        await this.graphEvents.ticketChanged(
          transaction,
          organizationId,
          ticketId,
          'changed',
        );
      }
      return toTicketLabelDomain(labelRow);
    });
  }

  async detachLabel(
    organizationId: string,
    projectId: string,
    ticketId: string,
    labelId: string,
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
      const [labelRow] = await transaction
        .select({ id: ticketLabel.id })
        .from(ticketLabel)
        .where(
          and(
            eq(ticketLabel.id, labelId),
            eq(ticketLabel.projectId, projectId),
          ),
        )
        .limit(1);
      if (!labelRow) {
        return false;
      }
      const [removed] = await transaction
        .delete(ticketLabelAssignment)
        .where(
          and(
            eq(ticketLabelAssignment.ticketId, ticketId),
            eq(ticketLabelAssignment.labelId, labelId),
          ),
        )
        .returning({ ticketId: ticketLabelAssignment.ticketId });
      if (removed) {
        await touchProject(
          transaction,
          projectId,
          new Date(),
          this.graphEvents,
        );
        await this.graphEvents.ticketChanged(
          transaction,
          organizationId,
          ticketId,
          'changed',
        );
      }
      return true;
    });
  }
}
