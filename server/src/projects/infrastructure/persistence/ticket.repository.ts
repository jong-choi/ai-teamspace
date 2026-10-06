import type { Ticket, TicketPriority } from '@/projects/domain/ticket';

export type CreateTicketPersistenceInput = {
  organizationId: string;
  projectId: string;
  columnId: string;
  title: string;
  descriptionMarkdown: string;
  priority: TicketPriority;
  assigneeUserId: string | null;
  reporterUserId: string;
  dueAt: Date | null;
};

export type CreateTicketResult =
  | { kind: 'created'; ticket: Ticket }
  | { kind: 'project_not_found' }
  | { kind: 'column_not_found' };

export type TicketChanges = {
  title?: string;
  descriptionMarkdown?: string;
  priority?: TicketPriority;
  assigneeUserId?: string | null;
  dueAt?: Date | null;
  archivedAt?: Date | null;
};

export type ListTicketsPersistenceInput = {
  organizationId: string;
  projectId: string;
  search?: string;
  columnId?: string;
  assigneeUserId?: string;
  priority?: TicketPriority;
};

export abstract class TicketRepository {
  abstract listTickets(input: ListTicketsPersistenceInput): Promise<Ticket[]>;

  abstract findTicketById(
    organizationId: string,
    projectId: string,
    ticketId: string,
  ): Promise<Ticket | null>;

  abstract createTicketWithNumber(
    input: CreateTicketPersistenceInput,
  ): Promise<CreateTicketResult>;

  abstract updateTicket(input: {
    organizationId: string;
    projectId: string;
    ticketId: string;
    changes: TicketChanges;
  }): Promise<Ticket | null>;
}
