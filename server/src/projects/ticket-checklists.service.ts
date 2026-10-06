import { Injectable } from '@nestjs/common';

import type { OrganizationActorContext } from '@/organizations/organization-actor-context';
import {
  ProjectNotFoundError,
  TicketChecklistItemNotFoundError,
  TicketChecklistMoveReferenceInvalidError,
  TicketChecklistNotFoundError,
  TicketNotFoundError,
} from '@/projects/domain/project.error';
import type { CreateTicketChecklistInput } from '@/projects/dto/create-ticket-checklist.dto';
import type { CreateTicketChecklistItemInput } from '@/projects/dto/create-ticket-checklist-item.dto';
import {
  type MoveTicketChecklistItemInput,
  type MoveTicketChecklistItemResponse,
} from '@/projects/dto/move-ticket-checklist-item.dto';
import {
  type TicketChecklistItemResponse,
  type TicketChecklistResponse,
  toTicketChecklistItemResponse,
  toTicketChecklistResponse,
} from '@/projects/dto/ticket-checklist.dto';
import type { UpdateTicketChecklistInput } from '@/projects/dto/update-ticket-checklist.dto';
import type { UpdateTicketChecklistItemInput } from '@/projects/dto/update-ticket-checklist-item.dto';
import { TicketWorkflowRepository } from '@/projects/infrastructure/persistence/ticket-workflow.repository';
import { TicketWorkflowAccessPolicy } from '@/projects/ticket-workflow-access.policy';

@Injectable()
export class TicketChecklistsService {
  constructor(
    private readonly workflowRepository: TicketWorkflowRepository,
    private readonly accessPolicy: TicketWorkflowAccessPolicy,
  ) {}

  async createChecklist(
    context: OrganizationActorContext,
    organizationId: string,
    projectId: string,
    ticketId: string,
    input: CreateTicketChecklistInput,
  ): Promise<TicketChecklistResponse> {
    await this.accessPolicy.requireWritableTicket(
      context,
      organizationId,
      projectId,
      ticketId,
    );
    const model = await this.workflowRepository.createChecklist({
      organizationId,
      projectId,
      ticketId,
      title: input.title,
    });
    if (!model) throw new TicketNotFoundError();
    return toTicketChecklistResponse(model.checklist, model.items);
  }

  async updateChecklist(
    context: OrganizationActorContext,
    organizationId: string,
    projectId: string,
    ticketId: string,
    checklistId: string,
    input: UpdateTicketChecklistInput,
  ): Promise<TicketChecklistResponse> {
    await this.accessPolicy.requireWritableTicket(
      context,
      organizationId,
      projectId,
      ticketId,
    );
    const model = await this.workflowRepository.renameChecklist({
      organizationId,
      projectId,
      ticketId,
      checklistId,
      title: input.title,
    });
    if (!model) throw new TicketChecklistNotFoundError();
    return toTicketChecklistResponse(model.checklist, model.items);
  }

  async removeChecklist(
    context: OrganizationActorContext,
    organizationId: string,
    projectId: string,
    ticketId: string,
    checklistId: string,
  ): Promise<void> {
    await this.accessPolicy.requireWritableTicket(
      context,
      organizationId,
      projectId,
      ticketId,
    );
    const removed = await this.workflowRepository.removeChecklist({
      organizationId,
      projectId,
      ticketId,
      checklistId,
    });
    if (!removed) throw new TicketChecklistNotFoundError();
  }

  async addChecklistItem(
    context: OrganizationActorContext,
    organizationId: string,
    projectId: string,
    ticketId: string,
    checklistId: string,
    input: CreateTicketChecklistItemInput,
  ): Promise<TicketChecklistItemResponse> {
    await this.accessPolicy.requireWritableTicket(
      context,
      organizationId,
      projectId,
      ticketId,
    );
    const item = await this.workflowRepository.addChecklistItem({
      organizationId,
      projectId,
      ticketId,
      checklistId,
      title: input.title,
    });
    if (!item) throw new TicketChecklistNotFoundError();
    return toTicketChecklistItemResponse(item);
  }

  async updateChecklistItem(
    context: OrganizationActorContext,
    organizationId: string,
    projectId: string,
    ticketId: string,
    checklistId: string,
    itemId: string,
    input: UpdateTicketChecklistItemInput,
  ): Promise<TicketChecklistItemResponse> {
    await this.accessPolicy.requireWritableTicket(
      context,
      organizationId,
      projectId,
      ticketId,
    );

    const item =
      input.title !== undefined
        ? await this.workflowRepository.renameChecklistItem({
            organizationId,
            projectId,
            ticketId,
            checklistId,
            itemId,
            title: input.title,
          })
        : input.completed !== undefined
          ? await this.workflowRepository.toggleChecklistItem({
              organizationId,
              projectId,
              ticketId,
              checklistId,
              itemId,
              completed: input.completed,
            })
          : undefined;
    if (item === undefined) {
      throw new Error('검증된 체크리스트 항목 변경 입력이 없습니다.');
    }
    if (item === null) throw new TicketChecklistItemNotFoundError();
    return toTicketChecklistItemResponse(item);
  }

  async moveChecklistItem(
    context: OrganizationActorContext,
    organizationId: string,
    projectId: string,
    ticketId: string,
    checklistId: string,
    itemId: string,
    input: MoveTicketChecklistItemInput,
  ): Promise<MoveTicketChecklistItemResponse> {
    await this.accessPolicy.requireWritableTicket(
      context,
      organizationId,
      projectId,
      ticketId,
    );
    const result = await this.workflowRepository.moveChecklistItem({
      organizationId,
      projectId,
      ticketId,
      checklistId,
      itemId,
      beforeItemId: input.beforeItemId ?? null,
      afterItemId: input.afterItemId ?? null,
    });

    switch (result.kind) {
      case 'project_not_found':
        throw new ProjectNotFoundError();
      case 'ticket_not_found':
        throw new TicketNotFoundError();
      case 'checklist_not_found':
        throw new TicketChecklistNotFoundError();
      case 'item_not_found':
        throw new TicketChecklistItemNotFoundError();
      case 'reference_not_found':
        throw new TicketChecklistMoveReferenceInvalidError();
      case 'moved':
        return {
          itemId: result.item.id,
          checklistId: result.item.checklistId,
          position: result.item.position,
          updatedAt: result.item.updatedAt.toISOString(),
        };
    }
  }

  async removeChecklistItem(
    context: OrganizationActorContext,
    organizationId: string,
    projectId: string,
    ticketId: string,
    checklistId: string,
    itemId: string,
  ): Promise<void> {
    await this.accessPolicy.requireWritableTicket(
      context,
      organizationId,
      projectId,
      ticketId,
    );
    const removed = await this.workflowRepository.removeChecklistItem({
      organizationId,
      projectId,
      ticketId,
      checklistId,
      itemId,
    });
    if (!removed) throw new TicketChecklistItemNotFoundError();
  }
}
