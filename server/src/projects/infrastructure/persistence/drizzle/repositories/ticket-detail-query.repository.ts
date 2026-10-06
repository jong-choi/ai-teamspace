import { Injectable } from '@nestjs/common';

import { DatabaseService } from '@/database/database.service';
import type { TicketChecklistItem } from '@/projects/domain/ticket-checklist-item';
import { toTicketChecklistDomain } from '@/projects/infrastructure/persistence/drizzle/mappers/ticket-checklist.mapper';
import { toTicketChecklistItemDomain } from '@/projects/infrastructure/persistence/drizzle/mappers/ticket-checklist-item.mapper';
import { toTicketCommentDomain } from '@/projects/infrastructure/persistence/drizzle/mappers/ticket-comment.mapper';
import { toTicketLabelDomain } from '@/projects/infrastructure/persistence/drizzle/mappers/ticket-label.mapper';
import { ticket } from '@/projects/infrastructure/persistence/drizzle/schema/ticket.schema';
import { ticketChecklist } from '@/projects/infrastructure/persistence/drizzle/schema/ticket-checklist.schema';
import { ticketChecklistItem } from '@/projects/infrastructure/persistence/drizzle/schema/ticket-checklist-item.schema';
import { ticketComment } from '@/projects/infrastructure/persistence/drizzle/schema/ticket-comment.schema';
import { ticketLabel } from '@/projects/infrastructure/persistence/drizzle/schema/ticket-label.schema';
import { ticketLabelAssignment } from '@/projects/infrastructure/persistence/drizzle/schema/ticket-label-assignment.schema';
import {
  type TicketCardMetadata,
  type TicketDetailChildren,
  TicketDetailQueryRepository,
} from '@/projects/infrastructure/persistence/ticket-detail-query.repository';

import { and, asc, count, eq, inArray, isNull } from 'drizzle-orm';

@Injectable()
export class TicketDetailQueryDrizzleRepository extends TicketDetailQueryRepository {
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
