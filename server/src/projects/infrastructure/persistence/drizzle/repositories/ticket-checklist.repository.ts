import { Injectable } from '@nestjs/common';

import { DatabaseService } from '@/database/database.service';
import { OutboxAggregateChangePublisher } from '@/outbox/outbox-aggregate-change.publisher';
import type { TicketChecklistItem } from '@/projects/domain/ticket-checklist-item';
import type { CreateTicketChecklistInput } from '@/projects/dto/create-ticket-checklist.dto';
import type { CreateTicketChecklistItemInput } from '@/projects/dto/create-ticket-checklist-item.dto';
import type { MoveTicketChecklistItemInput } from '@/projects/dto/move-ticket-checklist-item.dto';
import type { UpdateTicketChecklistInput } from '@/projects/dto/update-ticket-checklist.dto';
import type { UpdateTicketChecklistItemInput } from '@/projects/dto/update-ticket-checklist-item.dto';
import {
  toTicketChecklistDomain,
  toTicketChecklistInsert,
  toTicketChecklistUpdate,
} from '@/projects/infrastructure/persistence/drizzle/mappers/ticket-checklist.mapper';
import {
  toTicketChecklistItemDomain,
  toTicketChecklistItemInsert,
  toTicketChecklistItemUpdate,
} from '@/projects/infrastructure/persistence/drizzle/mappers/ticket-checklist-item.mapper';
import {
  activeTicketExists,
  checklistBelongsToTicket,
  lockActiveProject,
  lockActiveTicket,
  normalizeChecklistItemOrder,
  normalizeChecklistOrder,
  persistChecklistItemOrder,
  resolveInsertionIndex,
  touchProject,
} from '@/projects/infrastructure/persistence/drizzle/repositories/ticket-workflow.helpers';
import { ticketChecklist } from '@/projects/infrastructure/persistence/drizzle/schema/ticket-checklist.schema';
import { ticketChecklistItem } from '@/projects/infrastructure/persistence/drizzle/schema/ticket-checklist-item.schema';
import {
  type MoveChecklistItemResult,
  TicketChecklistRepository,
} from '@/projects/infrastructure/persistence/ticket-checklist.repository';
import type { TicketChecklistReadModel } from '@/projects/infrastructure/persistence/ticket-detail-query.repository';

import { and, asc, eq, max } from 'drizzle-orm';

@Injectable()
export class TicketChecklistDrizzleRepository extends TicketChecklistRepository {
  constructor(
    private readonly database: DatabaseService,
    private readonly graphEvents: OutboxAggregateChangePublisher,
  ) {
    super();
  }

  async createChecklist(
    organizationId: string,
    projectId: string,
    ticketId: string,
    input: CreateTicketChecklistInput,
  ): Promise<TicketChecklistReadModel | null> {
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
      const [positionRow] = await transaction
        .select({ position: max(ticketChecklist.position) })
        .from(ticketChecklist)
        .where(eq(ticketChecklist.ticketId, ticketId));
      const now = new Date();
      const [row] = await transaction
        .insert(ticketChecklist)
        .values(
          toTicketChecklistInsert({
            ticketId,
            title: input.title,
            position: (positionRow?.position ?? -1) + 1,
            updatedAt: now,
          }),
        )
        .returning();
      if (!row) {
        throw new Error('티켓 체크리스트 생성 결과가 없습니다.');
      }
      await touchProject(transaction, projectId, now);
      await this.graphEvents.ticketChanged(
        transaction,
        organizationId,
        ticketId,
        'changed',
      );
      return { checklist: toTicketChecklistDomain(row), items: [] };
    });
  }

  async updateChecklist(
    organizationId: string,
    projectId: string,
    ticketId: string,
    checklistId: string,
    input: UpdateTicketChecklistInput,
  ): Promise<TicketChecklistReadModel | null> {
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
        .update(ticketChecklist)
        .set(toTicketChecklistUpdate({ title: input.title, updatedAt: now }))
        .where(
          and(
            eq(ticketChecklist.id, checklistId),
            eq(ticketChecklist.ticketId, ticketId),
          ),
        )
        .returning();
      if (!row) {
        return null;
      }
      const items = await transaction
        .select()
        .from(ticketChecklistItem)
        .where(eq(ticketChecklistItem.checklistId, checklistId))
        .orderBy(
          asc(ticketChecklistItem.position),
          asc(ticketChecklistItem.id),
        );
      await touchProject(transaction, projectId, now);
      await this.graphEvents.ticketChanged(
        transaction,
        organizationId,
        ticketId,
        'changed',
      );
      return {
        checklist: toTicketChecklistDomain(row),
        items: items.map(toTicketChecklistItemDomain),
      };
    });
  }

  async removeChecklist(
    organizationId: string,
    projectId: string,
    ticketId: string,
    checklistId: string,
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
      const [removed] = await transaction
        .delete(ticketChecklist)
        .where(
          and(
            eq(ticketChecklist.id, checklistId),
            eq(ticketChecklist.ticketId, ticketId),
          ),
        )
        .returning({ id: ticketChecklist.id });
      if (!removed) {
        return false;
      }
      const now = new Date();
      await normalizeChecklistOrder(transaction, ticketId, now);
      await touchProject(transaction, projectId, now);
      await this.graphEvents.ticketChanged(
        transaction,
        organizationId,
        ticketId,
        'changed',
      );
      return true;
    });
  }

  async addChecklistItem(
    organizationId: string,
    projectId: string,
    ticketId: string,
    checklistId: string,
    input: CreateTicketChecklistItemInput,
  ): Promise<TicketChecklistItem | null> {
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
      if (
        !(await checklistBelongsToTicket(transaction, checklistId, ticketId))
      ) {
        return null;
      }
      const [positionRow] = await transaction
        .select({ position: max(ticketChecklistItem.position) })
        .from(ticketChecklistItem)
        .where(eq(ticketChecklistItem.checklistId, checklistId));
      const now = new Date();
      const [row] = await transaction
        .insert(ticketChecklistItem)
        .values(
          toTicketChecklistItemInsert({
            checklistId,
            title: input.title,
            completed: false,
            position: (positionRow?.position ?? -1) + 1,
            updatedAt: now,
          }),
        )
        .returning();
      if (!row) {
        throw new Error('티켓 체크리스트 항목 생성 결과가 없습니다.');
      }
      await touchProject(transaction, projectId, now);
      await this.graphEvents.ticketChanged(
        transaction,
        organizationId,
        ticketId,
        'changed',
      );
      return toTicketChecklistItemDomain(row);
    });
  }

  async updateChecklistItem(
    organizationId: string,
    projectId: string,
    ticketId: string,
    checklistId: string,
    itemId: string,
    input: UpdateTicketChecklistItemInput,
  ): Promise<TicketChecklistItem | null> {
    return this.persistChecklistItemUpdate(
      organizationId,
      projectId,
      ticketId,
      checklistId,
      itemId,
      input,
    );
  }

  async moveChecklistItem(
    organizationId: string,
    projectId: string,
    ticketId: string,
    checklistId: string,
    itemId: string,
    input: MoveTicketChecklistItemInput,
  ): Promise<MoveChecklistItemResult> {
    return this.database.db.transaction(async (transaction) => {
      if (!(await lockActiveProject(transaction, organizationId, projectId))) {
        return { kind: 'project_not_found' };
      }
      if (
        !(await activeTicketExists(
          transaction,
          organizationId,
          projectId,
          ticketId,
        ))
      ) {
        return { kind: 'ticket_not_found' };
      }
      if (
        !(await checklistBelongsToTicket(transaction, checklistId, ticketId))
      ) {
        return { kind: 'checklist_not_found' };
      }

      const rows = await transaction
        .select()
        .from(ticketChecklistItem)
        .where(eq(ticketChecklistItem.checklistId, checklistId))
        .orderBy(asc(ticketChecklistItem.position), asc(ticketChecklistItem.id))
        .for('update');
      const source = rows.find(({ id }) => id === itemId);
      if (!source) {
        return { kind: 'item_not_found' };
      }
      const withoutSource = rows.filter(({ id }) => id !== itemId);
      const insertionIndex = resolveInsertionIndex(
        withoutSource,
        input.beforeItemId ?? null,
        input.afterItemId ?? null,
      );
      if (insertionIndex === null) {
        return { kind: 'reference_not_found' };
      }
      const finalOrder = [...withoutSource];
      finalOrder.splice(insertionIndex, 0, source);
      const now = new Date();
      const result = await persistChecklistItemOrder(
        transaction,
        finalOrder,
        now,
        itemId,
      );
      if (result.changed) {
        await touchProject(transaction, projectId, now);
        await this.graphEvents.ticketChanged(
          transaction,
          organizationId,
          ticketId,
          'changed',
        );
      }
      return {
        kind: 'moved',
        item: result.focus ?? toTicketChecklistItemDomain(source),
      };
    });
  }

  async removeChecklistItem(
    organizationId: string,
    projectId: string,
    ticketId: string,
    checklistId: string,
    itemId: string,
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
      if (
        !(await checklistBelongsToTicket(transaction, checklistId, ticketId))
      ) {
        return false;
      }
      const [removed] = await transaction
        .delete(ticketChecklistItem)
        .where(
          and(
            eq(ticketChecklistItem.id, itemId),
            eq(ticketChecklistItem.checklistId, checklistId),
          ),
        )
        .returning({ id: ticketChecklistItem.id });
      if (!removed) {
        return false;
      }
      const now = new Date();
      await normalizeChecklistItemOrder(transaction, checklistId, now);
      await touchProject(transaction, projectId, now);
      await this.graphEvents.ticketChanged(
        transaction,
        organizationId,
        ticketId,
        'changed',
      );
      return true;
    });
  }

  private async persistChecklistItemUpdate(
    organizationId: string,
    projectId: string,
    ticketId: string,
    checklistId: string,
    itemId: string,
    input: UpdateTicketChecklistItemInput,
  ): Promise<TicketChecklistItem | null> {
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
      if (
        !(await checklistBelongsToTicket(transaction, checklistId, ticketId))
      ) {
        return null;
      }
      const now = new Date();
      const [row] = await transaction
        .update(ticketChecklistItem)
        .set(toTicketChecklistItemUpdate({ ...input, updatedAt: now }))
        .where(
          and(
            eq(ticketChecklistItem.id, itemId),
            eq(ticketChecklistItem.checklistId, checklistId),
          ),
        )
        .returning();
      if (!row) {
        return null;
      }
      await touchProject(transaction, projectId, now);
      await this.graphEvents.ticketChanged(
        transaction,
        organizationId,
        ticketId,
        'changed',
      );
      return toTicketChecklistItemDomain(row);
    });
  }
}
