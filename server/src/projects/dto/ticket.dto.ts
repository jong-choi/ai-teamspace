import type { AuthUserIdentity } from '#server/auth/auth-user-directory.service.js';
import { createZodDto } from '#server/common/dto/create-zod-dto.js';
import type { Ticket } from '#server/projects/domain/ticket.js';
import {
  ProjectUserSummarySchema,
  toProjectUserSummary,
} from '#server/projects/dto/project.dto.js';
import {
  TicketChecklistResponseSchema,
  toTicketChecklistResponse,
} from '#server/projects/dto/ticket-checklist.dto.js';
import {
  type TicketCommentResponse,
  TicketCommentResponseSchema,
} from '#server/projects/dto/ticket-comment.dto.js';
import {
  TicketLabelResponseSchema,
  toTicketLabelResponse,
} from '#server/projects/dto/ticket-label.dto.js';
import { ticketSelectSchema } from '#server/projects/infrastructure/persistence/drizzle/schema/ticket.zod.js';
import type {
  TicketCardMetadata,
  TicketChecklistReadModel,
} from '#server/projects/infrastructure/persistence/ticket-workflow.repository.js';

import { z } from 'zod';

export const TicketSummarySchema = ticketSelectSchema
  .pick({
    id: true,
    projectId: true,
    columnId: true,
    number: true,
    title: true,
    priority: true,
    position: true,
  })
  .extend({
    key: z.string().min(1),
    assignee: ProjectUserSummarySchema.nullable(),
    labels: z.array(TicketLabelResponseSchema),
    checklistItemTotal: z.number().int().nonnegative(),
    checklistItemCompleted: z.number().int().nonnegative(),
    commentCount: z.number().int().nonnegative(),
    dueAt: z.string().datetime().nullable(),
    updatedAt: z.string().datetime(),
  })
  .meta({ id: 'TicketSummary' });

export const TicketDetailSchema = TicketSummarySchema.extend({
  descriptionMarkdown: ticketSelectSchema.shape.descriptionMarkdown,
  reporter: ProjectUserSummarySchema,
  checklists: z.array(TicketChecklistResponseSchema),
  comments: z.array(TicketCommentResponseSchema),
  createdAt: z.string().datetime(),
  archivedAt: z.string().datetime().nullable(),
}).meta({ id: 'TicketDetail' });

export const TicketListSchema = z
  .object({ items: z.array(TicketSummarySchema) })
  .meta({ id: 'TicketList' });

export type TicketSummaryResponse = z.infer<typeof TicketSummarySchema>;
export type TicketDetailResponse = z.infer<typeof TicketDetailSchema>;
export type TicketListResponse = z.infer<typeof TicketListSchema>;

export type TicketDetailProjection = {
  metadata: TicketCardMetadata;
  checklists: readonly TicketChecklistReadModel[];
  comments: readonly TicketCommentResponse[];
};

export function toTicketSummaryResponse(
  ticket: Ticket,
  projectKey: string,
  assignee: AuthUserIdentity | undefined,
  metadata: TicketCardMetadata,
): TicketSummaryResponse {
  return TicketSummarySchema.parse({
    id: ticket.id,
    projectId: ticket.projectId,
    columnId: ticket.columnId,
    number: ticket.number,
    key: `${projectKey}-${ticket.number}`,
    title: ticket.title,
    priority: ticket.priority,
    assignee: toProjectUserSummary(assignee),
    labels: metadata.labels.map(toTicketLabelResponse),
    checklistItemTotal: metadata.checklistItemTotal,
    checklistItemCompleted: metadata.checklistItemCompleted,
    commentCount: metadata.commentCount,
    position: ticket.position,
    dueAt: ticket.dueAt?.toISOString() ?? null,
    updatedAt: ticket.updatedAt.toISOString(),
  });
}

export function toTicketDetailResponse(
  ticket: Ticket,
  projectKey: string,
  assignee: AuthUserIdentity | undefined,
  reporter: AuthUserIdentity,
  projection: TicketDetailProjection,
): TicketDetailResponse {
  const reporterSummary = toProjectUserSummary(reporter);
  if (!reporterSummary) {
    throw new Error('티켓 reporter 사용자 projection을 만들 수 없습니다.');
  }

  return TicketDetailSchema.parse({
    ...toTicketSummaryResponse(
      ticket,
      projectKey,
      assignee,
      projection.metadata,
    ),
    descriptionMarkdown: ticket.descriptionMarkdown,
    reporter: reporterSummary,
    checklists: projection.checklists.map(({ checklist, items }) =>
      toTicketChecklistResponse(checklist, items),
    ),
    comments: projection.comments,
    createdAt: ticket.createdAt.toISOString(),
    archivedAt: ticket.archivedAt?.toISOString() ?? null,
  });
}

export class TicketSummaryDto extends createZodDto(TicketSummarySchema) {}
export class TicketDetailDto extends createZodDto(TicketDetailSchema) {}
export class TicketListDto extends createZodDto(TicketListSchema) {}
