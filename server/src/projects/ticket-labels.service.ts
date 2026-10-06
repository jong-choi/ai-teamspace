import { Injectable } from '@nestjs/common';

import type { OrganizationActorContext } from '@/organizations/organization-actor-context';
import {
  ProjectNotFoundError,
  TicketLabelNotFoundError,
} from '@/projects/domain/project.error';
import type { CreateTicketLabelInput } from '@/projects/dto/create-ticket-label.dto';
import {
  type TicketLabelListResponse,
  type TicketLabelResponse,
  toTicketLabelResponse,
} from '@/projects/dto/ticket-label.dto';
import type { UpdateTicketLabelInput } from '@/projects/dto/update-ticket-label.dto';
import { TicketWorkflowRepository } from '@/projects/infrastructure/persistence/ticket-workflow.repository';
import { TicketWorkflowAccessPolicy } from '@/projects/ticket-workflow-access.policy';

@Injectable()
export class TicketLabelsService {
  constructor(
    private readonly workflowRepository: TicketWorkflowRepository,
    private readonly accessPolicy: TicketWorkflowAccessPolicy,
  ) {}

  async listLabels(
    context: OrganizationActorContext,
    organizationId: string,
    projectId: string,
  ): Promise<TicketLabelListResponse> {
    await this.accessPolicy.requireReadableProject(
      context,
      organizationId,
      projectId,
    );
    const labels = await this.workflowRepository.listLabels(
      organizationId,
      projectId,
    );
    return { items: labels.map(toTicketLabelResponse) };
  }

  async createLabel(
    context: OrganizationActorContext,
    organizationId: string,
    projectId: string,
    input: CreateTicketLabelInput,
  ): Promise<TicketLabelResponse> {
    await this.accessPolicy.requireWritableProject(
      context,
      organizationId,
      projectId,
    );
    const label = await this.workflowRepository.createLabel({
      organizationId,
      projectId,
      name: input.name,
      color: input.color ?? 'neutral',
    });
    if (!label) throw new ProjectNotFoundError();
    return toTicketLabelResponse(label);
  }

  async updateLabel(
    context: OrganizationActorContext,
    organizationId: string,
    projectId: string,
    labelId: string,
    input: UpdateTicketLabelInput,
  ): Promise<TicketLabelResponse> {
    await this.accessPolicy.requireWritableProject(
      context,
      organizationId,
      projectId,
    );
    const label = await this.workflowRepository.updateLabel({
      organizationId,
      projectId,
      labelId,
      ...input,
    });
    if (!label) throw new TicketLabelNotFoundError();
    return toTicketLabelResponse(label);
  }

  async attachLabel(
    context: OrganizationActorContext,
    organizationId: string,
    projectId: string,
    ticketId: string,
    labelId: string,
  ): Promise<TicketLabelResponse> {
    await this.accessPolicy.requireWritableTicket(
      context,
      organizationId,
      projectId,
      ticketId,
    );
    const label = await this.workflowRepository.attachLabel({
      organizationId,
      projectId,
      ticketId,
      labelId,
    });
    if (!label) throw new TicketLabelNotFoundError();
    return toTicketLabelResponse(label);
  }

  async detachLabel(
    context: OrganizationActorContext,
    organizationId: string,
    projectId: string,
    ticketId: string,
    labelId: string,
  ): Promise<void> {
    await this.accessPolicy.requireWritableTicket(
      context,
      organizationId,
      projectId,
      ticketId,
    );
    const detached = await this.workflowRepository.detachLabel({
      organizationId,
      projectId,
      ticketId,
      labelId,
    });
    if (!detached) throw new TicketLabelNotFoundError();
  }
}
