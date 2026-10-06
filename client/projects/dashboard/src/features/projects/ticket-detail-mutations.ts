import { useTicketChecklistMutations } from '@core/features/projects/ticket-checklist-mutations';
import { useTicketCommentMutations } from '@core/features/projects/ticket-comment-mutations';
import { useTicketLabelMutations } from '@core/features/projects/ticket-label-mutations';
import type { TicketMutationScope } from '@core/features/projects/ticket-mutation.types';
import { useTicketMutations } from '@core/features/projects/ticket-mutations';

export function useTicketDetailMutations(scope: TicketMutationScope) {
  const ticket = useTicketMutations(scope);
  const labels = useTicketLabelMutations(scope);
  const checklists = useTicketChecklistMutations(scope);
  const comments = useTicketCommentMutations(scope);

  return {
    updateTicket: ticket.updateTicket,
    moveTicket: ticket.moveTicket,
    attachLabel: labels.attachLabel,
    detachLabel: labels.detachLabel,
    createChecklist: checklists.createChecklist,
    updateChecklist: checklists.updateChecklist,
    removeChecklist: checklists.removeChecklist,
    addChecklistItem: checklists.addChecklistItem,
    updateChecklistItem: checklists.updateChecklistItem,
    moveChecklistItem: checklists.moveChecklistItem,
    removeChecklistItem: checklists.removeChecklistItem,
    createComment: comments.createComment,
    updateComment: comments.updateComment,
    removeComment: comments.removeComment,
    ticketPending: ticket.pending,
    labelPending: labels.pending,
    checklistPending: checklists.pending,
    commentPending: comments.pending,
  };
}
