import { Injectable } from '@nestjs/common';

import type { OrganizationActorContext } from '@/organizations/organization-actor-context';
import {
  ProjectColumnNotFoundError,
  ProjectNotFoundError,
  TicketMoveReferenceInvalidError,
  TicketNotFoundError,
} from '@/projects/domain/project.error';
import {
  type MoveTicketInput,
  type MoveTicketResponse,
} from '@/projects/dto/move-ticket.dto';
import { TicketOrderingRepository } from '@/projects/infrastructure/persistence/ticket-ordering.repository';
import { TicketWorkflowAccessPolicy } from '@/projects/ticket-workflow-access.policy';

@Injectable()
export class TicketOrderingService {
  constructor(
    private readonly orderingRepository: TicketOrderingRepository,
    private readonly accessPolicy: TicketWorkflowAccessPolicy,
  ) {}

  async moveTicket(
    context: OrganizationActorContext,
    organizationId: string,
    projectId: string,
    ticketId: string,
    input: MoveTicketInput,
  ): Promise<MoveTicketResponse> {
    await this.accessPolicy.requireWritableTicket(
      context,
      organizationId,
      projectId,
      ticketId,
    );
    const result = await this.orderingRepository.moveTicket(
      organizationId,
      projectId,
      ticketId,
      input,
    );

    switch (result.kind) {
      case 'project_not_found':
        throw new ProjectNotFoundError();
      case 'ticket_not_found':
        throw new TicketNotFoundError();
      case 'column_not_found':
        throw new ProjectColumnNotFoundError();
      case 'reference_not_found':
        throw new TicketMoveReferenceInvalidError();
      case 'moved':
        return {
          ticketId: result.ticket.id,
          columnId: result.ticket.columnId,
          position: result.ticket.position,
          updatedAt: result.ticket.updatedAt.toISOString(),
        };
    }
  }
}
