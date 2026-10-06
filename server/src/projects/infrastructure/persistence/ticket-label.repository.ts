import type { TicketLabel } from '@/projects/domain/ticket-label';
import type { CreateTicketLabelInput } from '@/projects/dto/create-ticket-label.dto';
import type { UpdateTicketLabelInput } from '@/projects/dto/update-ticket-label.dto';

export abstract class TicketLabelRepository {
  abstract listLabels(
    organizationId: string,
    projectId: string,
  ): Promise<TicketLabel[]>;

  abstract createLabel(
    organizationId: string,
    projectId: string,
    input: CreateTicketLabelInput,
  ): Promise<TicketLabel | null>;

  abstract updateLabel(
    organizationId: string,
    projectId: string,
    labelId: string,
    input: UpdateTicketLabelInput,
  ): Promise<TicketLabel | null>;

  abstract attachLabel(
    organizationId: string,
    projectId: string,
    ticketId: string,
    labelId: string,
  ): Promise<TicketLabel | null>;

  abstract detachLabel(
    organizationId: string,
    projectId: string,
    ticketId: string,
    labelId: string,
  ): Promise<boolean>;
}
