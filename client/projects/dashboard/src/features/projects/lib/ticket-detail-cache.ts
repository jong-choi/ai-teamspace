import type {
  TicketDetail,
  UpdateTicket,
} from '@repo/client/api-client/schemas';

export function mergeTicketDetailUpdate(
  current: TicketDetail | undefined,
  incoming: TicketDetail,
): TicketDetail {
  if (!current) return incoming;

  return {
    ...incoming,
    labels: current.labels,
    checklists: current.checklists,
    comments: current.comments,
    checklistItemTotal: current.checklistItemTotal,
    checklistItemCompleted: current.checklistItemCompleted,
    commentCount: current.commentCount,
  };
}

export function updateAffectsTicketSummary(input: UpdateTicket): boolean {
  return (
    input.title !== undefined ||
    input.priority !== undefined ||
    input.assigneeUserId !== undefined ||
    input.dueAt !== undefined ||
    input.archived !== undefined
  );
}
