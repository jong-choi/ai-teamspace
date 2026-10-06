import { DatabaseService } from '@/database/database.service';
import type { Ticket } from '@/projects/domain/ticket';
import type { TicketChecklistItem } from '@/projects/domain/ticket-checklist-item';
import { toProjectUpdate } from '@/projects/infrastructure/persistence/drizzle/mappers/project.mapper';
import {
  toTicketDomain,
  toTicketUpdate,
} from '@/projects/infrastructure/persistence/drizzle/mappers/ticket.mapper';
import { toTicketChecklistUpdate } from '@/projects/infrastructure/persistence/drizzle/mappers/ticket-checklist.mapper';
import {
  toTicketChecklistItemDomain,
  toTicketChecklistItemUpdate,
} from '@/projects/infrastructure/persistence/drizzle/mappers/ticket-checklist-item.mapper';
import { project } from '@/projects/infrastructure/persistence/drizzle/schema/project.schema';
import { ticket } from '@/projects/infrastructure/persistence/drizzle/schema/ticket.schema';
import { ticketChecklist } from '@/projects/infrastructure/persistence/drizzle/schema/ticket-checklist.schema';
import { ticketChecklistItem } from '@/projects/infrastructure/persistence/drizzle/schema/ticket-checklist-item.schema';

import { and, asc, eq, isNull } from 'drizzle-orm';

type WorkflowTransaction = Parameters<
  Parameters<DatabaseService['db']['transaction']>[0]
>[0];
type TicketOrderRow = typeof ticket.$inferSelect;
type ChecklistItemOrderRow = typeof ticketChecklistItem.$inferSelect;

export async function lockActiveProject(
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

export async function activeTicketExists(
  transaction: WorkflowTransaction,
  organizationId: Ticket['organizationId'],
  projectId: Ticket['projectId'],
  ticketId: Ticket['id'],
): Promise<boolean> {
  const [row] = await transaction
    .select({ id: ticket.id })
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
  return row !== undefined;
}

export async function lockActiveTicket(
  transaction: WorkflowTransaction,
  organizationId: Ticket['organizationId'],
  projectId: Ticket['projectId'],
  ticketId: Ticket['id'],
): Promise<boolean> {
  return (
    (await lockActiveProject(transaction, organizationId, projectId)) &&
    (await activeTicketExists(transaction, organizationId, projectId, ticketId))
  );
}

export async function checklistBelongsToTicket(
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

export function resolveInsertionIndex<T extends { id: string }>(
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

export async function persistTicketOrder(
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

export async function persistChecklistItemOrder(
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

export async function normalizeChecklistOrder(
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

export async function normalizeChecklistItemOrder(
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

export async function touchProject(
  transaction: WorkflowTransaction,
  projectId: string,
  updatedAt: Date,
): Promise<void> {
  await transaction
    .update(project)
    .set(toProjectUpdate({ updatedAt }))
    .where(eq(project.id, projectId));
}
