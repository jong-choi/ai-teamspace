import type { TicketChecklistItem } from '@/projects/domain/ticket-checklist-item';
import type { CreateTicketChecklistInput } from '@/projects/dto/create-ticket-checklist.dto';
import type { CreateTicketChecklistItemInput } from '@/projects/dto/create-ticket-checklist-item.dto';
import type { MoveTicketChecklistItemInput } from '@/projects/dto/move-ticket-checklist-item.dto';
import type { UpdateTicketChecklistInput } from '@/projects/dto/update-ticket-checklist.dto';
import type { UpdateTicketChecklistItemInput } from '@/projects/dto/update-ticket-checklist-item.dto';
import type { TicketChecklistReadModel } from '@/projects/infrastructure/persistence/ticket-detail-query.repository';

export type MoveChecklistItemResult =
  | { kind: 'moved'; item: TicketChecklistItem }
  | { kind: 'project_not_found' }
  | { kind: 'ticket_not_found' }
  | { kind: 'checklist_not_found' }
  | { kind: 'item_not_found' }
  | { kind: 'reference_not_found' };

export abstract class TicketChecklistRepository {
  abstract createChecklist(
    organizationId: string,
    projectId: string,
    ticketId: string,
    input: CreateTicketChecklistInput,
  ): Promise<TicketChecklistReadModel | null>;

  abstract updateChecklist(
    organizationId: string,
    projectId: string,
    ticketId: string,
    checklistId: string,
    input: UpdateTicketChecklistInput,
  ): Promise<TicketChecklistReadModel | null>;

  abstract removeChecklist(
    organizationId: string,
    projectId: string,
    ticketId: string,
    checklistId: string,
  ): Promise<boolean>;

  abstract addChecklistItem(
    organizationId: string,
    projectId: string,
    ticketId: string,
    checklistId: string,
    input: CreateTicketChecklistItemInput,
  ): Promise<TicketChecklistItem | null>;

  abstract updateChecklistItem(
    organizationId: string,
    projectId: string,
    ticketId: string,
    checklistId: string,
    itemId: string,
    input: UpdateTicketChecklistItemInput,
  ): Promise<TicketChecklistItem | null>;

  abstract moveChecklistItem(
    organizationId: string,
    projectId: string,
    ticketId: string,
    checklistId: string,
    itemId: string,
    input: MoveTicketChecklistItemInput,
  ): Promise<MoveChecklistItemResult>;

  abstract removeChecklistItem(
    organizationId: string,
    projectId: string,
    ticketId: string,
    checklistId: string,
    itemId: string,
  ): Promise<boolean>;
}
