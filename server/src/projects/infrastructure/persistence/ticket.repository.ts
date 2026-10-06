import type { Ticket } from '@/projects/domain/ticket';
import type { CreateTicketInput } from '@/projects/dto/create-ticket.dto';
import type { QueryTicketsInput } from '@/projects/dto/query-tickets.dto';
import type { UpdateTicketInput } from '@/projects/dto/update-ticket.dto';

export type CreateTicketResult =
  | { kind: 'created'; ticket: Ticket }
  | { kind: 'project_not_found' }
  | { kind: 'column_not_found' };

export abstract class TicketRepository {
  abstract listTickets(
    organizationId: string,
    projectId: string,
    input: QueryTicketsInput,
  ): Promise<Ticket[]>;

  abstract findTicketById(
    organizationId: string,
    projectId: string,
    ticketId: string,
  ): Promise<Ticket | null>;

  abstract createTicketWithNumber(
    organizationId: string,
    projectId: string,
    reporterUserId: string,
    input: CreateTicketInput,
  ): Promise<CreateTicketResult>;

  abstract updateTicket(
    organizationId: string,
    projectId: string,
    ticketId: string,
    input: UpdateTicketInput,
  ): Promise<Ticket | null>;
}
