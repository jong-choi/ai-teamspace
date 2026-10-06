import type { IncomingHttpHeaders } from 'node:http';

import {
  Body,
  Controller,
  Delete,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import type { Auth } from '@/auth/auth';
import { TrustedOriginGuard } from '@/common/http/trusted-origin.guard';
import { toOrganizationActorContext } from '@/organizations/organization-actor-context';
import {
  CreateTicketChecklistDto,
  type CreateTicketChecklistInput,
} from '@/projects/dto/create-ticket-checklist.dto';
import {
  CreateTicketChecklistItemDto,
  type CreateTicketChecklistItemInput,
} from '@/projects/dto/create-ticket-checklist-item.dto';
import {
  MoveTicketChecklistItemDto,
  type MoveTicketChecklistItemInput,
  MoveTicketChecklistItemResultDto,
} from '@/projects/dto/move-ticket-checklist-item.dto';
import {
  TicketChecklistDto,
  TicketChecklistItemDto,
} from '@/projects/dto/ticket-checklist.dto';
import {
  UpdateTicketChecklistDto,
  type UpdateTicketChecklistInput,
} from '@/projects/dto/update-ticket-checklist.dto';
import {
  UpdateTicketChecklistItemDto,
  type UpdateTicketChecklistItemInput,
} from '@/projects/dto/update-ticket-checklist-item.dto';
import { TicketChecklistsService } from '@/projects/ticket-checklists.service';

import { Session, type UserSession } from '@thallesp/nestjs-better-auth';
import { ApiProblemResponse } from 'nest-problem-details-filter/swagger';

const problemDetailsSchema = { $ref: '#/components/schemas/ProblemDetails' };

@ApiTags('ticket-workflow')
@ApiProblemResponse({ status: 400, schema: problemDetailsSchema })
@ApiProblemResponse({ status: 401, schema: problemDetailsSchema })
@ApiProblemResponse({ status: 403, schema: problemDetailsSchema })
@ApiProblemResponse({ status: 404, schema: problemDetailsSchema })
@ApiProblemResponse({ status: 409, schema: problemDetailsSchema })
@ApiProblemResponse({ status: 500, schema: problemDetailsSchema })
@Controller('organizations/:organizationId/projects')
@UseGuards(TrustedOriginGuard)
export class TicketChecklistsController {
  constructor(private readonly checklistsService: TicketChecklistsService) {}

  @Post(':projectId/tickets/:ticketId/checklists')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    operationId: 'TicketWorkflowController_createTicketChecklist',
  })
  @ApiCreatedResponse({ standardSchema: TicketChecklistDto.schema })
  createTicketChecklist(
    @Session() session: UserSession<Auth>,
    @Headers() headers: IncomingHttpHeaders,
    @Param('organizationId') organizationId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('ticketId', ParseUUIDPipe) ticketId: string,
    @Body({ schema: CreateTicketChecklistDto.schema })
    input: CreateTicketChecklistInput,
  ): Promise<TicketChecklistDto> {
    return this.checklistsService.createChecklist(
      toOrganizationActorContext(session, headers),
      organizationId,
      projectId,
      ticketId,
      input,
    );
  }

  @Patch(':projectId/tickets/:ticketId/checklists/:checklistId')
  @ApiOperation({
    operationId: 'TicketWorkflowController_updateTicketChecklist',
  })
  @ApiOkResponse({ standardSchema: TicketChecklistDto.schema })
  updateTicketChecklist(
    @Session() session: UserSession<Auth>,
    @Headers() headers: IncomingHttpHeaders,
    @Param('organizationId') organizationId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('ticketId', ParseUUIDPipe) ticketId: string,
    @Param('checklistId', ParseUUIDPipe) checklistId: string,
    @Body({ schema: UpdateTicketChecklistDto.schema })
    input: UpdateTicketChecklistInput,
  ): Promise<TicketChecklistDto> {
    return this.checklistsService.updateChecklist(
      toOrganizationActorContext(session, headers),
      organizationId,
      projectId,
      ticketId,
      checklistId,
      input,
    );
  }

  @Delete(':projectId/tickets/:ticketId/checklists/:checklistId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    operationId: 'TicketWorkflowController_removeTicketChecklist',
  })
  @ApiNoContentResponse()
  removeTicketChecklist(
    @Session() session: UserSession<Auth>,
    @Headers() headers: IncomingHttpHeaders,
    @Param('organizationId') organizationId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('ticketId', ParseUUIDPipe) ticketId: string,
    @Param('checklistId', ParseUUIDPipe) checklistId: string,
  ): Promise<void> {
    return this.checklistsService.removeChecklist(
      toOrganizationActorContext(session, headers),
      organizationId,
      projectId,
      ticketId,
      checklistId,
    );
  }

  @Post(':projectId/tickets/:ticketId/checklists/:checklistId/items')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    operationId: 'TicketWorkflowController_addTicketChecklistItem',
  })
  @ApiCreatedResponse({ standardSchema: TicketChecklistItemDto.schema })
  addTicketChecklistItem(
    @Session() session: UserSession<Auth>,
    @Headers() headers: IncomingHttpHeaders,
    @Param('organizationId') organizationId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('ticketId', ParseUUIDPipe) ticketId: string,
    @Param('checklistId', ParseUUIDPipe) checklistId: string,
    @Body({ schema: CreateTicketChecklistItemDto.schema })
    input: CreateTicketChecklistItemInput,
  ): Promise<TicketChecklistItemDto> {
    return this.checklistsService.addChecklistItem(
      toOrganizationActorContext(session, headers),
      organizationId,
      projectId,
      ticketId,
      checklistId,
      input,
    );
  }

  @Patch(':projectId/tickets/:ticketId/checklists/:checklistId/items/:itemId')
  @ApiOperation({
    operationId: 'TicketWorkflowController_updateTicketChecklistItem',
  })
  @ApiOkResponse({ standardSchema: TicketChecklistItemDto.schema })
  updateTicketChecklistItem(
    @Session() session: UserSession<Auth>,
    @Headers() headers: IncomingHttpHeaders,
    @Param('organizationId') organizationId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('ticketId', ParseUUIDPipe) ticketId: string,
    @Param('checklistId', ParseUUIDPipe) checklistId: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body({ schema: UpdateTicketChecklistItemDto.schema })
    input: UpdateTicketChecklistItemInput,
  ): Promise<TicketChecklistItemDto> {
    return this.checklistsService.updateChecklistItem(
      toOrganizationActorContext(session, headers),
      organizationId,
      projectId,
      ticketId,
      checklistId,
      itemId,
      input,
    );
  }

  @Post(
    ':projectId/tickets/:ticketId/checklists/:checklistId/items/:itemId/move',
  )
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: 'TicketWorkflowController_moveTicketChecklistItem',
  })
  @ApiOkResponse({ standardSchema: MoveTicketChecklistItemResultDto.schema })
  moveTicketChecklistItem(
    @Session() session: UserSession<Auth>,
    @Headers() headers: IncomingHttpHeaders,
    @Param('organizationId') organizationId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('ticketId', ParseUUIDPipe) ticketId: string,
    @Param('checklistId', ParseUUIDPipe) checklistId: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body({ schema: MoveTicketChecklistItemDto.schema })
    input: MoveTicketChecklistItemInput,
  ): Promise<MoveTicketChecklistItemResultDto> {
    return this.checklistsService.moveChecklistItem(
      toOrganizationActorContext(session, headers),
      organizationId,
      projectId,
      ticketId,
      checklistId,
      itemId,
      input,
    );
  }

  @Delete(':projectId/tickets/:ticketId/checklists/:checklistId/items/:itemId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    operationId: 'TicketWorkflowController_removeTicketChecklistItem',
  })
  @ApiNoContentResponse()
  removeTicketChecklistItem(
    @Session() session: UserSession<Auth>,
    @Headers() headers: IncomingHttpHeaders,
    @Param('organizationId') organizationId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('ticketId', ParseUUIDPipe) ticketId: string,
    @Param('checklistId', ParseUUIDPipe) checklistId: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
  ): Promise<void> {
    return this.checklistsService.removeChecklistItem(
      toOrganizationActorContext(session, headers),
      organizationId,
      projectId,
      ticketId,
      checklistId,
      itemId,
    );
  }
}
