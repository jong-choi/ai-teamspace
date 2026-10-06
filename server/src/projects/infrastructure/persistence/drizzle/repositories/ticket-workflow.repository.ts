import { Injectable } from '@nestjs/common';

import { DatabaseService } from '#server/database/database.service.js';
import type { Ticket } from '#server/projects/domain/ticket.js';
import type { TicketChecklistItem } from '#server/projects/domain/ticket-checklist-item.js';
import type { TicketComment } from '#server/projects/domain/ticket-comment.js';
import type { TicketLabel } from '#server/projects/domain/ticket-label.js';
import { toProjectUpdate } from '#server/projects/infrastructure/persistence/drizzle/mappers/project.mapper.js';
import {
  toTicketDomain,
  toTicketUpdate,
} from '#server/projects/infrastructure/persistence/drizzle/mappers/ticket.mapper.js';
import {
  toTicketChecklistDomain,
  toTicketChecklistInsert,
  toTicketChecklistUpdate,
} from '#server/projects/infrastructure/persistence/drizzle/mappers/ticket-checklist.mapper.js';
import {
  toTicketChecklistItemDomain,
  toTicketChecklistItemInsert,
  toTicketChecklistItemUpdate,
} from '#server/projects/infrastructure/persistence/drizzle/mappers/ticket-checklist-item.mapper.js';
import {
  toTicketCommentDomain,
  toTicketCommentInsert,
  toTicketCommentUpdate,
} from '#server/projects/infrastructure/persistence/drizzle/mappers/ticket-comment.mapper.js';
import {
  toTicketLabelDomain,
  toTicketLabelInsert,
  toTicketLabelUpdate,
} from '#server/projects/infrastructure/persistence/drizzle/mappers/ticket-label.mapper.js';
import { project } from '#server/projects/infrastructure/persistence/drizzle/schema/project.schema.js';
import { projectColumn } from '#server/projects/infrastructure/persistence/drizzle/schema/project-column.schema.js';
import { ticket } from '#server/projects/infrastructure/persistence/drizzle/schema/ticket.schema.js';
import { ticketChecklist } from '#server/projects/infrastructure/persistence/drizzle/schema/ticket-checklist.schema.js';
import { ticketChecklistItem } from '#server/projects/infrastructure/persistence/drizzle/schema/ticket-checklist-item.schema.js';
import { ticketComment } from '#server/projects/infrastructure/persistence/drizzle/schema/ticket-comment.schema.js';
import { ticketLabel } from '#server/projects/infrastructure/persistence/drizzle/schema/ticket-label.schema.js';
import { ticketLabelAssignment } from '#server/projects/infrastructure/persistence/drizzle/schema/ticket-label-assignment.schema.js';
import {
  type MoveChecklistItemPersistenceInput,
  type MoveChecklistItemResult,
  type MoveTicketPersistenceInput,
  type MoveTicketResult,
  type TicketCardMetadata,
  type TicketChecklistReadModel,
  type TicketDetailChildren,
  TicketWorkflowRepository,
} from '#server/projects/infrastructure/persistence/ticket-workflow.repository.js';

import { and, asc, count, eq, inArray, isNull, max } from 'drizzle-orm';

type WorkflowTransaction = Parameters<
  Parameters<DatabaseService['db']['transaction']>[0]
>[0];

type TicketOrderRow = typeof ticket.$inferSelect;
type ChecklistItemOrderRow = typeof ticketChecklistItem.$inferSelect;

@Injectable()
export class TicketWorkflowDrizzleRepository extends TicketWorkflowRepository {
  constructor(private readonly database: DatabaseService) {
    super();
  }

  async loadCardMetadata(
    organizationId: string,
    projectId: string,
    ticketIds: readonly string[],
  ): Promise<TicketCardMetadata[]> {
    const metadataByTicketId = new Map<string, TicketCardMetadata>();
    for (const ticketId of ticketIds) {
      metadataByTicketId.set(ticketId, emptyCardMetadata(ticketId));
    }
    if (ticketIds.length === 0) {
      return [];
    }

    const ids = [...ticketIds];
    const [labelRows, checklistRows, commentRows] = await Promise.all([
      this.database.db
        .select({ ticketId: ticket.id, label: ticketLabel })
        .from(ticket)
        .innerJoin(
          ticketLabelAssignment,
          eq(ticketLabelAssignment.ticketId, ticket.id),
        )
        .innerJoin(
          ticketLabel,
          eq(ticketLabel.id, ticketLabelAssignment.labelId),
        )
        .where(
          and(
            eq(ticket.organizationId, organizationId),
            eq(ticket.projectId, projectId),
            inArray(ticket.id, ids),
            isNull(ticket.archivedAt),
            eq(ticketLabel.projectId, projectId),
          ),
        )
        .orderBy(asc(ticket.id), asc(ticketLabel.name), asc(ticketLabel.id)),
      this.database.db
        .select({
          ticketId: ticketChecklist.ticketId,
          completed: ticketChecklistItem.completed,
          count: count(ticketChecklistItem.id),
        })
        .from(ticketChecklistItem)
        .innerJoin(
          ticketChecklist,
          eq(ticketChecklist.id, ticketChecklistItem.checklistId),
        )
        .innerJoin(ticket, eq(ticket.id, ticketChecklist.ticketId))
        .where(
          and(
            eq(ticket.organizationId, organizationId),
            eq(ticket.projectId, projectId),
            inArray(ticket.id, ids),
            isNull(ticket.archivedAt),
          ),
        )
        .groupBy(ticketChecklist.ticketId, ticketChecklistItem.completed),
      this.database.db
        .select({
          ticketId: ticketComment.ticketId,
          count: count(ticketComment.id),
        })
        .from(ticketComment)
        .innerJoin(ticket, eq(ticket.id, ticketComment.ticketId))
        .where(
          and(
            eq(ticket.organizationId, organizationId),
            eq(ticket.projectId, projectId),
            inArray(ticket.id, ids),
            isNull(ticket.archivedAt),
          ),
        )
        .groupBy(ticketComment.ticketId),
    ]);

    for (const row of labelRows) {
      metadataByTicketId
        .get(row.ticketId)
        ?.labels.push(toTicketLabelDomain(row.label));
    }
    for (const row of checklistRows) {
      const metadata = metadataByTicketId.get(row.ticketId);
      if (!metadata) {
        continue;
      }
      const itemCount = Number(row.count);
      metadata.checklistItemTotal += itemCount;
      if (row.completed) {
        metadata.checklistItemCompleted += itemCount;
      }
    }
    for (const row of commentRows) {
      const metadata = metadataByTicketId.get(row.ticketId);
      if (metadata) {
        metadata.commentCount = Number(row.count);
      }
    }

    return ticketIds.map(
      (ticketId) =>
        metadataByTicketId.get(ticketId) ?? emptyCardMetadata(ticketId),
    );
  }

  async loadDetailChildren(
    organizationId: string,
    projectId: string,
    ticketId: string,
  ): Promise<TicketDetailChildren | null> {
    if (!(await this.ticketExists(organizationId, projectId, ticketId))) {
      return null;
    }

    const [labelRows, checklistRows, commentRows] = await Promise.all([
      this.database.db
        .select({ label: ticketLabel })
        .from(ticketLabelAssignment)
        .innerJoin(
          ticketLabel,
          eq(ticketLabel.id, ticketLabelAssignment.labelId),
        )
        .where(
          and(
            eq(ticketLabelAssignment.ticketId, ticketId),
            eq(ticketLabel.projectId, projectId),
          ),
        )
        .orderBy(asc(ticketLabel.name), asc(ticketLabel.id)),
      this.database.db
        .select()
        .from(ticketChecklist)
        .where(eq(ticketChecklist.ticketId, ticketId))
        .orderBy(asc(ticketChecklist.position), asc(ticketChecklist.id)),
      this.database.db
        .select()
        .from(ticketComment)
        .where(eq(ticketComment.ticketId, ticketId))
        .orderBy(asc(ticketComment.createdAt), asc(ticketComment.id)),
    ]);

    const checklistIds = checklistRows.map(({ id }) => id);
    const itemRows =
      checklistIds.length === 0
        ? []
        : await this.database.db
            .select()
            .from(ticketChecklistItem)
            .where(inArray(ticketChecklistItem.checklistId, checklistIds))
            .orderBy(
              asc(ticketChecklistItem.checklistId),
              asc(ticketChecklistItem.position),
              asc(ticketChecklistItem.id),
            );
    const itemsByChecklistId = new Map<string, TicketChecklistItem[]>();
    for (const row of itemRows) {
      const items = itemsByChecklistId.get(row.checklistId) ?? [];
      items.push(toTicketChecklistItemDomain(row));
      itemsByChecklistId.set(row.checklistId, items);
    }

    return {
      labels: labelRows.map(({ label }) => toTicketLabelDomain(label)),
      checklists: checklistRows.map((row) => ({
        checklist: toTicketChecklistDomain(row),
        items: itemsByChecklistId.get(row.id) ?? [],
      })),
      comments: commentRows.map(toTicketCommentDomain),
    };
  }

  async moveTicket(
    input: MoveTicketPersistenceInput,
  ): Promise<MoveTicketResult> {
    return this.database.db.transaction(async (transaction) => {
      if (
        !(await lockActiveProject(
          transaction,
          input.organizationId,
          input.projectId,
        ))
      ) {
        return { kind: 'project_not_found' };
      }

      const [sourceTicket] = await transaction
        .select()
        .from(ticket)
        .where(
          and(
            eq(ticket.id, input.ticketId),
            eq(ticket.organizationId, input.organizationId),
            eq(ticket.projectId, input.projectId),
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
            eq(projectColumn.projectId, input.projectId),
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
            eq(ticket.organizationId, input.organizationId),
            eq(ticket.projectId, input.projectId),
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
                  eq(ticket.organizationId, input.organizationId),
                  eq(ticket.projectId, input.projectId),
                  eq(ticket.columnId, input.targetColumnId),
                  isNull(ticket.archivedAt),
                ),
              )
              .orderBy(asc(ticket.position), asc(ticket.id))
              .for('update');

      const targetWithoutSource = targetRows.filter(
        ({ id }) => id !== sourceTicket.id,
      );
      const insertionIndex = resolveInsertionIndex(
        targetWithoutSource,
        input.beforeTicketId,
        input.afterTicketId,
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
          sourceTicket.id,
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
          sourceTicket.id,
        );
        const targetResult = await persistTicketOrder(
          transaction,
          input.targetColumnId,
          finalTargetOrder,
          now,
          sourceTicket.id,
        );
        movedTicket = targetResult.focus ?? movedTicket;
        changed = sourceResult.changed || targetResult.changed;
      }

      if (changed) {
        await touchProject(transaction, input.projectId, now);
      }
      return { kind: 'moved', ticket: movedTicket };
    });
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
    input: Parameters<TicketWorkflowRepository['createLabel']>[0],
  ): Promise<TicketLabel | null> {
    return this.database.db.transaction(async (transaction) => {
      if (
        !(await lockActiveProject(
          transaction,
          input.organizationId,
          input.projectId,
        ))
      ) {
        return null;
      }
      const now = new Date();
      const [row] = await transaction
        .insert(ticketLabel)
        .values(
          toTicketLabelInsert({
            projectId: input.projectId,
            name: input.name,
            color: input.color,
            updatedAt: now,
          }),
        )
        .returning();
      if (!row) {
        throw new Error('티켓 라벨 생성 결과가 없습니다.');
      }
      await touchProject(transaction, input.projectId, now);
      return toTicketLabelDomain(row);
    });
  }

  async updateLabel(
    input: Parameters<TicketWorkflowRepository['updateLabel']>[0],
  ): Promise<TicketLabel | null> {
    return this.database.db.transaction(async (transaction) => {
      if (
        !(await lockActiveProject(
          transaction,
          input.organizationId,
          input.projectId,
        ))
      ) {
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
            eq(ticketLabel.id, input.labelId),
            eq(ticketLabel.projectId, input.projectId),
          ),
        )
        .returning();
      if (!row) {
        return null;
      }
      await touchProject(transaction, input.projectId, now);
      return toTicketLabelDomain(row);
    });
  }

  async attachLabel(
    input: Parameters<TicketWorkflowRepository['attachLabel']>[0],
  ): Promise<TicketLabel | null> {
    return this.database.db.transaction(async (transaction) => {
      if (!(await lockActiveTicket(transaction, input))) {
        return null;
      }
      const [labelRow] = await transaction
        .select()
        .from(ticketLabel)
        .where(
          and(
            eq(ticketLabel.id, input.labelId),
            eq(ticketLabel.projectId, input.projectId),
          ),
        )
        .limit(1);
      if (!labelRow) {
        return null;
      }
      const [assignment] = await transaction
        .insert(ticketLabelAssignment)
        .values({ ticketId: input.ticketId, labelId: input.labelId })
        .onConflictDoNothing()
        .returning({ ticketId: ticketLabelAssignment.ticketId });
      if (assignment) {
        await touchProject(transaction, input.projectId, new Date());
      }
      return toTicketLabelDomain(labelRow);
    });
  }

  async detachLabel(
    input: Parameters<TicketWorkflowRepository['detachLabel']>[0],
  ): Promise<boolean> {
    return this.database.db.transaction(async (transaction) => {
      if (!(await lockActiveTicket(transaction, input))) {
        return false;
      }
      const [labelRow] = await transaction
        .select({ id: ticketLabel.id })
        .from(ticketLabel)
        .where(
          and(
            eq(ticketLabel.id, input.labelId),
            eq(ticketLabel.projectId, input.projectId),
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
            eq(ticketLabelAssignment.ticketId, input.ticketId),
            eq(ticketLabelAssignment.labelId, input.labelId),
          ),
        )
        .returning({ ticketId: ticketLabelAssignment.ticketId });
      if (removed) {
        await touchProject(transaction, input.projectId, new Date());
      }
      return true;
    });
  }

  async createChecklist(
    input: Parameters<TicketWorkflowRepository['createChecklist']>[0],
  ): Promise<TicketChecklistReadModel | null> {
    return this.database.db.transaction(async (transaction) => {
      if (!(await lockActiveTicket(transaction, input))) {
        return null;
      }
      const [positionRow] = await transaction
        .select({ position: max(ticketChecklist.position) })
        .from(ticketChecklist)
        .where(eq(ticketChecklist.ticketId, input.ticketId));
      const now = new Date();
      const [row] = await transaction
        .insert(ticketChecklist)
        .values(
          toTicketChecklistInsert({
            ticketId: input.ticketId,
            title: input.title,
            position: (positionRow?.position ?? -1) + 1,
            updatedAt: now,
          }),
        )
        .returning();
      if (!row) {
        throw new Error('티켓 체크리스트 생성 결과가 없습니다.');
      }
      await touchProject(transaction, input.projectId, now);
      return { checklist: toTicketChecklistDomain(row), items: [] };
    });
  }

  async renameChecklist(
    input: Parameters<TicketWorkflowRepository['renameChecklist']>[0],
  ): Promise<TicketChecklistReadModel | null> {
    return this.database.db.transaction(async (transaction) => {
      if (!(await lockActiveTicket(transaction, input))) {
        return null;
      }
      const now = new Date();
      const [row] = await transaction
        .update(ticketChecklist)
        .set(toTicketChecklistUpdate({ title: input.title, updatedAt: now }))
        .where(
          and(
            eq(ticketChecklist.id, input.checklistId),
            eq(ticketChecklist.ticketId, input.ticketId),
          ),
        )
        .returning();
      if (!row) {
        return null;
      }
      const items = await transaction
        .select()
        .from(ticketChecklistItem)
        .where(eq(ticketChecklistItem.checklistId, input.checklistId))
        .orderBy(
          asc(ticketChecklistItem.position),
          asc(ticketChecklistItem.id),
        );
      await touchProject(transaction, input.projectId, now);
      return {
        checklist: toTicketChecklistDomain(row),
        items: items.map(toTicketChecklistItemDomain),
      };
    });
  }

  async removeChecklist(
    input: Parameters<TicketWorkflowRepository['removeChecklist']>[0],
  ): Promise<boolean> {
    return this.database.db.transaction(async (transaction) => {
      if (!(await lockActiveTicket(transaction, input))) {
        return false;
      }
      const [removed] = await transaction
        .delete(ticketChecklist)
        .where(
          and(
            eq(ticketChecklist.id, input.checklistId),
            eq(ticketChecklist.ticketId, input.ticketId),
          ),
        )
        .returning({ id: ticketChecklist.id });
      if (!removed) {
        return false;
      }
      const now = new Date();
      await normalizeChecklistOrder(transaction, input.ticketId, now);
      await touchProject(transaction, input.projectId, now);
      return true;
    });
  }

  async addChecklistItem(
    input: Parameters<TicketWorkflowRepository['addChecklistItem']>[0],
  ): Promise<TicketChecklistItem | null> {
    return this.database.db.transaction(async (transaction) => {
      if (!(await lockActiveTicket(transaction, input))) {
        return null;
      }
      if (
        !(await checklistBelongsToTicket(
          transaction,
          input.checklistId,
          input.ticketId,
        ))
      ) {
        return null;
      }
      const [positionRow] = await transaction
        .select({ position: max(ticketChecklistItem.position) })
        .from(ticketChecklistItem)
        .where(eq(ticketChecklistItem.checklistId, input.checklistId));
      const now = new Date();
      const [row] = await transaction
        .insert(ticketChecklistItem)
        .values(
          toTicketChecklistItemInsert({
            checklistId: input.checklistId,
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
      await touchProject(transaction, input.projectId, now);
      return toTicketChecklistItemDomain(row);
    });
  }

  async renameChecklistItem(
    input: Parameters<TicketWorkflowRepository['renameChecklistItem']>[0],
  ): Promise<TicketChecklistItem | null> {
    return this.updateChecklistItem(input, { title: input.title });
  }

  async toggleChecklistItem(
    input: Parameters<TicketWorkflowRepository['toggleChecklistItem']>[0],
  ): Promise<TicketChecklistItem | null> {
    return this.updateChecklistItem(input, { completed: input.completed });
  }

  async moveChecklistItem(
    input: MoveChecklistItemPersistenceInput,
  ): Promise<MoveChecklistItemResult> {
    return this.database.db.transaction(async (transaction) => {
      if (
        !(await lockActiveProject(
          transaction,
          input.organizationId,
          input.projectId,
        ))
      ) {
        return { kind: 'project_not_found' };
      }
      if (!(await activeTicketExists(transaction, input))) {
        return { kind: 'ticket_not_found' };
      }
      if (
        !(await checklistBelongsToTicket(
          transaction,
          input.checklistId,
          input.ticketId,
        ))
      ) {
        return { kind: 'checklist_not_found' };
      }

      const rows = await transaction
        .select()
        .from(ticketChecklistItem)
        .where(eq(ticketChecklistItem.checklistId, input.checklistId))
        .orderBy(asc(ticketChecklistItem.position), asc(ticketChecklistItem.id))
        .for('update');
      const source = rows.find(({ id }) => id === input.itemId);
      if (!source) {
        return { kind: 'item_not_found' };
      }
      const withoutSource = rows.filter(({ id }) => id !== input.itemId);
      const insertionIndex = resolveInsertionIndex(
        withoutSource,
        input.beforeItemId,
        input.afterItemId,
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
        input.itemId,
      );
      if (result.changed) {
        await touchProject(transaction, input.projectId, now);
      }
      return {
        kind: 'moved',
        item: result.focus ?? toTicketChecklistItemDomain(source),
      };
    });
  }

  async removeChecklistItem(
    input: Parameters<TicketWorkflowRepository['removeChecklistItem']>[0],
  ): Promise<boolean> {
    return this.database.db.transaction(async (transaction) => {
      if (!(await lockActiveTicket(transaction, input))) {
        return false;
      }
      if (
        !(await checklistBelongsToTicket(
          transaction,
          input.checklistId,
          input.ticketId,
        ))
      ) {
        return false;
      }
      const [removed] = await transaction
        .delete(ticketChecklistItem)
        .where(
          and(
            eq(ticketChecklistItem.id, input.itemId),
            eq(ticketChecklistItem.checklistId, input.checklistId),
          ),
        )
        .returning({ id: ticketChecklistItem.id });
      if (!removed) {
        return false;
      }
      const now = new Date();
      await normalizeChecklistItemOrder(transaction, input.checklistId, now);
      await touchProject(transaction, input.projectId, now);
      return true;
    });
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
    input: Parameters<TicketWorkflowRepository['createComment']>[0],
  ): Promise<TicketComment | null> {
    return this.database.db.transaction(async (transaction) => {
      if (!(await lockActiveTicket(transaction, input))) {
        return null;
      }
      const now = new Date();
      const [row] = await transaction
        .insert(ticketComment)
        .values(
          toTicketCommentInsert({
            ticketId: input.ticketId,
            authorUserId: input.authorUserId,
            contentMarkdown: input.contentMarkdown,
            updatedAt: now,
          }),
        )
        .returning();
      if (!row) {
        throw new Error('티켓 댓글 생성 결과가 없습니다.');
      }
      await touchProject(transaction, input.projectId, now);
      return toTicketCommentDomain(row);
    });
  }

  async updateComment(
    input: Parameters<TicketWorkflowRepository['updateComment']>[0],
  ): Promise<TicketComment | null> {
    return this.database.db.transaction(async (transaction) => {
      if (!(await lockActiveTicket(transaction, input))) {
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
            eq(ticketComment.id, input.commentId),
            eq(ticketComment.ticketId, input.ticketId),
          ),
        )
        .returning();
      if (!row) {
        return null;
      }
      await touchProject(transaction, input.projectId, now);
      return toTicketCommentDomain(row);
    });
  }

  async removeComment(
    input: Parameters<TicketWorkflowRepository['removeComment']>[0],
  ): Promise<boolean> {
    return this.database.db.transaction(async (transaction) => {
      if (!(await lockActiveTicket(transaction, input))) {
        return false;
      }
      const [row] = await transaction
        .delete(ticketComment)
        .where(
          and(
            eq(ticketComment.id, input.commentId),
            eq(ticketComment.ticketId, input.ticketId),
          ),
        )
        .returning({ id: ticketComment.id });
      if (!row) {
        return false;
      }
      await touchProject(transaction, input.projectId, new Date());
      return true;
    });
  }

  private async updateChecklistItem(
    input:
      | Parameters<TicketWorkflowRepository['renameChecklistItem']>[0]
      | Parameters<TicketWorkflowRepository['toggleChecklistItem']>[0],
    values: Parameters<typeof toTicketChecklistItemUpdate>[0],
  ): Promise<TicketChecklistItem | null> {
    return this.database.db.transaction(async (transaction) => {
      if (!(await lockActiveTicket(transaction, input))) {
        return null;
      }
      if (
        !(await checklistBelongsToTicket(
          transaction,
          input.checklistId,
          input.ticketId,
        ))
      ) {
        return null;
      }
      const now = new Date();
      const [row] = await transaction
        .update(ticketChecklistItem)
        .set(toTicketChecklistItemUpdate({ ...values, updatedAt: now }))
        .where(
          and(
            eq(ticketChecklistItem.id, input.itemId),
            eq(ticketChecklistItem.checklistId, input.checklistId),
          ),
        )
        .returning();
      if (!row) {
        return null;
      }
      await touchProject(transaction, input.projectId, now);
      return toTicketChecklistItemDomain(row);
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

function emptyCardMetadata(ticketId: string): TicketCardMetadata {
  return {
    ticketId,
    labels: [],
    checklistItemTotal: 0,
    checklistItemCompleted: 0,
    commentCount: 0,
  };
}

async function lockActiveProject(
  transaction: WorkflowTransaction,
  organizationId: string,
  projectId: string,
): Promise<boolean> {
  const [row] = await transaction
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
  return row !== undefined;
}

async function activeTicketExists(
  transaction: WorkflowTransaction,
  input: { organizationId: string; projectId: string; ticketId: string },
): Promise<boolean> {
  const [row] = await transaction
    .select({ id: ticket.id })
    .from(ticket)
    .where(
      and(
        eq(ticket.id, input.ticketId),
        eq(ticket.organizationId, input.organizationId),
        eq(ticket.projectId, input.projectId),
        isNull(ticket.archivedAt),
      ),
    )
    .for('update')
    .limit(1);
  return row !== undefined;
}

async function lockActiveTicket(
  transaction: WorkflowTransaction,
  input: { organizationId: string; projectId: string; ticketId: string },
): Promise<boolean> {
  return (
    (await lockActiveProject(
      transaction,
      input.organizationId,
      input.projectId,
    )) && (await activeTicketExists(transaction, input))
  );
}

async function checklistBelongsToTicket(
  transaction: WorkflowTransaction,
  checklistId: string,
  ticketId: string,
): Promise<boolean> {
  const [row] = await transaction
    .select({ id: ticketChecklist.id })
    .from(ticketChecklist)
    .where(
      and(
        eq(ticketChecklist.id, checklistId),
        eq(ticketChecklist.ticketId, ticketId),
      ),
    )
    .for('update')
    .limit(1);
  return row !== undefined;
}

function resolveInsertionIndex<T extends { id: string }>(
  rows: readonly T[],
  beforeId: string | null,
  afterId: string | null,
): number | null {
  if (beforeId !== null && afterId !== null) {
    return null;
  }
  if (beforeId !== null) {
    const index = rows.findIndex(({ id }) => id === beforeId);
    return index >= 0 ? index : null;
  }
  if (afterId !== null) {
    const index = rows.findIndex(({ id }) => id === afterId);
    return index >= 0 ? index + 1 : null;
  }
  return rows.length;
}

async function persistTicketOrder(
  transaction: WorkflowTransaction,
  columnId: string,
  rows: readonly TicketOrderRow[],
  updatedAt: Date,
  focusTicketId: string,
): Promise<{ changed: boolean; focus: Ticket | null }> {
  let changed = false;
  let focus: Ticket | null = null;
  for (const [position, row] of rows.entries()) {
    if (row.columnId === columnId && row.position === position) {
      if (row.id === focusTicketId) {
        focus = toTicketDomain(row);
      }
      continue;
    }
    const [updated] = await transaction
      .update(ticket)
      .set(toTicketUpdate({ columnId, position, updatedAt }))
      .where(eq(ticket.id, row.id))
      .returning();
    if (!updated) {
      throw new Error('티켓 이동 중 순서 갱신 결과가 없습니다.');
    }
    changed = true;
    if (updated.id === focusTicketId) {
      focus = toTicketDomain(updated);
    }
  }
  return { changed, focus };
}

async function persistChecklistItemOrder(
  transaction: WorkflowTransaction,
  rows: readonly ChecklistItemOrderRow[],
  updatedAt: Date,
  focusItemId: string,
): Promise<{ changed: boolean; focus: TicketChecklistItem | null }> {
  let changed = false;
  let focus: TicketChecklistItem | null = null;
  for (const [position, row] of rows.entries()) {
    if (row.position === position) {
      if (row.id === focusItemId) {
        focus = toTicketChecklistItemDomain(row);
      }
      continue;
    }
    const [updated] = await transaction
      .update(ticketChecklistItem)
      .set(toTicketChecklistItemUpdate({ position, updatedAt }))
      .where(eq(ticketChecklistItem.id, row.id))
      .returning();
    if (!updated) {
      throw new Error('체크리스트 항목 이동 중 순서 갱신 결과가 없습니다.');
    }
    changed = true;
    if (updated.id === focusItemId) {
      focus = toTicketChecklistItemDomain(updated);
    }
  }
  return { changed, focus };
}

async function normalizeChecklistOrder(
  transaction: WorkflowTransaction,
  ticketId: string,
  updatedAt: Date,
): Promise<void> {
  const rows = await transaction
    .select()
    .from(ticketChecklist)
    .where(eq(ticketChecklist.ticketId, ticketId))
    .orderBy(asc(ticketChecklist.position), asc(ticketChecklist.id))
    .for('update');
  for (const [position, row] of rows.entries()) {
    if (row.position !== position) {
      await transaction
        .update(ticketChecklist)
        .set(toTicketChecklistUpdate({ position, updatedAt }))
        .where(eq(ticketChecklist.id, row.id));
    }
  }
}

async function normalizeChecklistItemOrder(
  transaction: WorkflowTransaction,
  checklistId: string,
  updatedAt: Date,
): Promise<void> {
  const rows = await transaction
    .select()
    .from(ticketChecklistItem)
    .where(eq(ticketChecklistItem.checklistId, checklistId))
    .orderBy(asc(ticketChecklistItem.position), asc(ticketChecklistItem.id))
    .for('update');
  for (const [position, row] of rows.entries()) {
    if (row.position !== position) {
      await transaction
        .update(ticketChecklistItem)
        .set(toTicketChecklistItemUpdate({ position, updatedAt }))
        .where(eq(ticketChecklistItem.id, row.id));
    }
  }
}

async function touchProject(
  transaction: WorkflowTransaction,
  projectId: string,
  updatedAt: Date,
): Promise<void> {
  await transaction
    .update(project)
    .set(toProjectUpdate({ updatedAt }))
    .where(eq(project.id, projectId));
}
