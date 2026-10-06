import type { Ticket } from '#server/projects/domain/ticket.js';
import type { TicketChecklist } from '#server/projects/domain/ticket-checklist.js';
import type { TicketChecklistItem } from '#server/projects/domain/ticket-checklist-item.js';
import type { TicketComment } from '#server/projects/domain/ticket-comment.js';
import type {
  TicketLabel,
  TicketLabelColor,
} from '#server/projects/domain/ticket-label.js';

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

export type MoveTicketPersistenceInput = {
  organizationId: string;
  projectId: string;
  ticketId: string;
  targetColumnId: string;
  beforeTicketId: string | null;
  afterTicketId: string | null;
};

export type MoveTicketResult =
  | { kind: 'moved'; ticket: Ticket }
  | { kind: 'project_not_found' }
  | { kind: 'ticket_not_found' }
  | { kind: 'column_not_found' }
  | { kind: 'reference_not_found' };

export type MoveChecklistItemPersistenceInput = {
  organizationId: string;
  projectId: string;
  ticketId: string;
  checklistId: string;
  itemId: string;
  beforeItemId: string | null;
  afterItemId: string | null;
};

export type MoveChecklistItemResult =
  | { kind: 'moved'; item: TicketChecklistItem }
  | { kind: 'project_not_found' }
  | { kind: 'ticket_not_found' }
  | { kind: 'checklist_not_found' }
  | { kind: 'item_not_found' }
  | { kind: 'reference_not_found' };

export abstract class TicketWorkflowRepository {
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

  abstract moveTicket(
    input: MoveTicketPersistenceInput,
  ): Promise<MoveTicketResult>;

  abstract listLabels(
    organizationId: string,
    projectId: string,
  ): Promise<TicketLabel[]>;

  abstract createLabel(input: {
    organizationId: string;
    projectId: string;
    name: string;
    color: TicketLabelColor;
  }): Promise<TicketLabel | null>;

  abstract updateLabel(input: {
    organizationId: string;
    projectId: string;
    labelId: string;
    name?: string;
    color?: TicketLabelColor;
  }): Promise<TicketLabel | null>;

  abstract attachLabel(input: {
    organizationId: string;
    projectId: string;
    ticketId: string;
    labelId: string;
  }): Promise<TicketLabel | null>;

  abstract detachLabel(input: {
    organizationId: string;
    projectId: string;
    ticketId: string;
    labelId: string;
  }): Promise<boolean>;

  abstract createChecklist(input: {
    organizationId: string;
    projectId: string;
    ticketId: string;
    title: string;
  }): Promise<TicketChecklistReadModel | null>;

  abstract renameChecklist(input: {
    organizationId: string;
    projectId: string;
    ticketId: string;
    checklistId: string;
    title: string;
  }): Promise<TicketChecklistReadModel | null>;

  abstract removeChecklist(input: {
    organizationId: string;
    projectId: string;
    ticketId: string;
    checklistId: string;
  }): Promise<boolean>;

  abstract addChecklistItem(input: {
    organizationId: string;
    projectId: string;
    ticketId: string;
    checklistId: string;
    title: string;
  }): Promise<TicketChecklistItem | null>;

  abstract renameChecklistItem(input: {
    organizationId: string;
    projectId: string;
    ticketId: string;
    checklistId: string;
    itemId: string;
    title: string;
  }): Promise<TicketChecklistItem | null>;

  abstract toggleChecklistItem(input: {
    organizationId: string;
    projectId: string;
    ticketId: string;
    checklistId: string;
    itemId: string;
    completed: boolean;
  }): Promise<TicketChecklistItem | null>;

  abstract moveChecklistItem(
    input: MoveChecklistItemPersistenceInput,
  ): Promise<MoveChecklistItemResult>;

  abstract removeChecklistItem(input: {
    organizationId: string;
    projectId: string;
    ticketId: string;
    checklistId: string;
    itemId: string;
  }): Promise<boolean>;

  abstract listComments(
    organizationId: string,
    projectId: string,
    ticketId: string,
  ): Promise<TicketComment[] | null>;

  abstract findComment(
    organizationId: string,
    projectId: string,
    ticketId: string,
    commentId: string,
  ): Promise<TicketComment | null>;

  abstract createComment(input: {
    organizationId: string;
    projectId: string;
    ticketId: string;
    authorUserId: string;
    contentMarkdown: string;
  }): Promise<TicketComment | null>;

  abstract updateComment(input: {
    organizationId: string;
    projectId: string;
    ticketId: string;
    commentId: string;
    contentMarkdown: string;
  }): Promise<TicketComment | null>;

  abstract removeComment(input: {
    organizationId: string;
    projectId: string;
    ticketId: string;
    commentId: string;
  }): Promise<boolean>;
}
