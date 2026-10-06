import type { TicketChecklist } from '@/projects/domain/ticket-checklist';
import type { TicketChecklistItem } from '@/projects/domain/ticket-checklist-item';
import type { TicketComment } from '@/projects/domain/ticket-comment';
import type { TicketLabel } from '@/projects/domain/ticket-label';

export type TicketCardMetadata = {
  ticketId: string;
  labels: TicketLabel[];
  checklistItemTotal: number;
  checklistItemCompleted: number;
  commentCount: number;
};

export type TicketChecklistReadModel = {
  checklist: TicketChecklist;
  items: TicketChecklistItem[];
};

export type TicketDetailChildren = {
  labels: TicketLabel[];
  checklists: TicketChecklistReadModel[];
  comments: TicketComment[];
};

export abstract class TicketDetailQueryRepository {
  abstract loadCardMetadata(
    organizationId: string,
    projectId: string,
    ticketIds: readonly string[],
  ): Promise<TicketCardMetadata[]>;

  abstract loadDetailChildren(
    organizationId: string,
    projectId: string,
    ticketId: string,
  ): Promise<TicketDetailChildren | null>;
}
