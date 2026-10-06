import type { Ticket } from '@/projects/domain/ticket';
import type { MoveTicketInput } from '@/projects/dto/move-ticket.dto';

export type MoveTicketResult =
  | { kind: 'moved'; ticket: Ticket }
  | { kind: 'project_not_found' }
  | { kind: 'ticket_not_found' }
  | { kind: 'column_not_found' }
  | { kind: 'reference_not_found' };

export abstract class TicketOrderingRepository {
  abstract moveTicket(
    organizationId: string,
    projectId: string,
    ticketId: string,
    input: MoveTicketInput,
  ): Promise<MoveTicketResult>;
}
