import type { IncomingHttpHeaders } from 'node:http';

import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
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
  CreateTicketCommentDto,
  type CreateTicketCommentInput,
} from '@/projects/dto/create-ticket-comment.dto';
import {
  CreateTicketLabelDto,
  type CreateTicketLabelInput,
} from '@/projects/dto/create-ticket-label.dto';
import {
  MoveTicketDto,
  type MoveTicketInput,
  MoveTicketResultDto,
} from '@/projects/dto/move-ticket.dto';
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
  TicketCommentDto,
  TicketCommentListDto,
} from '@/projects/dto/ticket-comment.dto';
import {
  TicketLabelDto,
  TicketLabelListDto,
} from '@/projects/dto/ticket-label.dto';
import {
  UpdateTicketChecklistDto,
  type UpdateTicketChecklistInput,
} from '@/projects/dto/update-ticket-checklist.dto';
import {
  UpdateTicketChecklistItemDto,
  type UpdateTicketChecklistItemInput,
} from '@/projects/dto/update-ticket-checklist-item.dto';
import {
  UpdateTicketCommentDto,
  type UpdateTicketCommentInput,
} from '@/projects/dto/update-ticket-comment.dto';
import {
  UpdateTicketLabelDto,
  type UpdateTicketLabelInput,
} from '@/projects/dto/update-ticket-label.dto';
import { TicketWorkflowService } from '@/projects/ticket-workflow.service';

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
export class TicketWorkflowController {
  constructor(private readonly workflowService: TicketWorkflowService) {}

  @Get(':projectId/labels')
  @ApiOkResponse({ standardSchema: TicketLabelListDto.schema })
  listProjectLabels(
    @Session() session: UserSession<Auth>,
    @Headers() headers: IncomingHttpHeaders,
    @Param('organizationId') organizationId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
  ): Promise<TicketLabelListDto> {
    return this.workflowService.listLabels(
      toOrganizationActorContext(session, headers),
      organizationId,
      projectId,
    );
  }

  @Post(':projectId/labels')
  @HttpCode(HttpStatus.CREATED)
  @ApiCreatedResponse({ standardSchema: TicketLabelDto.schema })
  createProjectLabel(
    @Session() session: UserSession<Auth>,
    @Headers() headers: IncomingHttpHeaders,
    @Param('organizationId') organizationId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body({ schema: CreateTicketLabelDto.schema })
    input: CreateTicketLabelInput,
  ): Promise<TicketLabelDto> {
    return this.workflowService.createLabel(
      toOrganizationActorContext(session, headers),
      organizationId,
      projectId,
      input,
    );
  }

  @Patch(':projectId/labels/:labelId')
  @ApiOkResponse({ standardSchema: TicketLabelDto.schema })
  updateProjectLabel(
    @Session() session: UserSession<Auth>,
    @Headers() headers: IncomingHttpHeaders,
    @Param('organizationId') organizationId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('labelId', ParseUUIDPipe) labelId: string,
    @Body({ schema: UpdateTicketLabelDto.schema })
    input: UpdateTicketLabelInput,
  ): Promise<TicketLabelDto> {
    return this.workflowService.updateLabel(
      toOrganizationActorContext(session, headers),
      organizationId,
      projectId,
      labelId,
      input,
    );
  }

  @Post(':projectId/tickets/:ticketId/move')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ standardSchema: MoveTicketResultDto.schema })
  moveTicket(
    @Session() session: UserSession<Auth>,
    @Headers() headers: IncomingHttpHeaders,
    @Param('organizationId') organizationId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('ticketId', ParseUUIDPipe) ticketId: string,
    @Body({ schema: MoveTicketDto.schema }) input: MoveTicketInput,
  ): Promise<MoveTicketResultDto> {
    return this.workflowService.moveTicket(
      toOrganizationActorContext(session, headers),
      organizationId,
      projectId,
      ticketId,
      input,
    );
  }

  @Put(':projectId/tickets/:ticketId/labels/:labelId')
  @ApiOkResponse({ standardSchema: TicketLabelDto.schema })
  attachTicketLabel(
    @Session() session: UserSession<Auth>,
    @Headers() headers: IncomingHttpHeaders,
    @Param('organizationId') organizationId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('ticketId', ParseUUIDPipe) ticketId: string,
    @Param('labelId', ParseUUIDPipe) labelId: string,
  ): Promise<TicketLabelDto> {
    return this.workflowService.attachLabel(
      toOrganizationActorContext(session, headers),
      organizationId,
      projectId,
      ticketId,
      labelId,
    );
  }

  @Delete(':projectId/tickets/:ticketId/labels/:labelId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  detachTicketLabel(
    @Session() session: UserSession<Auth>,
    @Headers() headers: IncomingHttpHeaders,
    @Param('organizationId') organizationId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('ticketId', ParseUUIDPipe) ticketId: string,
    @Param('labelId', ParseUUIDPipe) labelId: string,
  ): Promise<void> {
    return this.workflowService.detachLabel(
      toOrganizationActorContext(session, headers),
      organizationId,
      projectId,
      ticketId,
      labelId,
    );
  }

  @Post(':projectId/tickets/:ticketId/checklists')
  @HttpCode(HttpStatus.CREATED)
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
    return this.workflowService.createChecklist(
      toOrganizationActorContext(session, headers),
      organizationId,
      projectId,
      ticketId,
      input,
    );
  }

  @Patch(':projectId/tickets/:ticketId/checklists/:checklistId')
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
    return this.workflowService.updateChecklist(
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
  @ApiNoContentResponse()
  removeTicketChecklist(
    @Session() session: UserSession<Auth>,
    @Headers() headers: IncomingHttpHeaders,
    @Param('organizationId') organizationId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('ticketId', ParseUUIDPipe) ticketId: string,
    @Param('checklistId', ParseUUIDPipe) checklistId: string,
  ): Promise<void> {
    return this.workflowService.removeChecklist(
      toOrganizationActorContext(session, headers),
      organizationId,
      projectId,
      ticketId,
      checklistId,
    );
  }

  @Post(':projectId/tickets/:ticketId/checklists/:checklistId/items')
  @HttpCode(HttpStatus.CREATED)
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
    return this.workflowService.addChecklistItem(
      toOrganizationActorContext(session, headers),
      organizationId,
      projectId,
      ticketId,
      checklistId,
      input,
    );
  }

  @Patch(':projectId/tickets/:ticketId/checklists/:checklistId/items/:itemId')
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
    return this.workflowService.updateChecklistItem(
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
    return this.workflowService.moveChecklistItem(
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
    return this.workflowService.removeChecklistItem(
      toOrganizationActorContext(session, headers),
      organizationId,
      projectId,
      ticketId,
      checklistId,
      itemId,
    );
  }

  @Get(':projectId/tickets/:ticketId/comments')
  @ApiOkResponse({ standardSchema: TicketCommentListDto.schema })
  listTicketComments(
    @Session() session: UserSession<Auth>,
    @Headers() headers: IncomingHttpHeaders,
    @Param('organizationId') organizationId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('ticketId', ParseUUIDPipe) ticketId: string,
  ): Promise<TicketCommentListDto> {
    return this.workflowService.listComments(
      toOrganizationActorContext(session, headers),
      organizationId,
      projectId,
      ticketId,
    );
  }

  @Post(':projectId/tickets/:ticketId/comments')
  @HttpCode(HttpStatus.CREATED)
  @ApiCreatedResponse({ standardSchema: TicketCommentDto.schema })
  createTicketComment(
    @Session() session: UserSession<Auth>,
    @Headers() headers: IncomingHttpHeaders,
    @Param('organizationId') organizationId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('ticketId', ParseUUIDPipe) ticketId: string,
    @Body({ schema: CreateTicketCommentDto.schema })
    input: CreateTicketCommentInput,
  ): Promise<TicketCommentDto> {
    return this.workflowService.createComment(
      toOrganizationActorContext(session, headers),
      organizationId,
      projectId,
      ticketId,
      input,
    );
  }

  @Patch(':projectId/tickets/:ticketId/comments/:commentId')
  @ApiOkResponse({ standardSchema: TicketCommentDto.schema })
  updateTicketComment(
    @Session() session: UserSession<Auth>,
    @Headers() headers: IncomingHttpHeaders,
    @Param('organizationId') organizationId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('ticketId', ParseUUIDPipe) ticketId: string,
    @Param('commentId', ParseUUIDPipe) commentId: string,
    @Body({ schema: UpdateTicketCommentDto.schema })
    input: UpdateTicketCommentInput,
  ): Promise<TicketCommentDto> {
    return this.workflowService.updateComment(
      toOrganizationActorContext(session, headers),
      organizationId,
      projectId,
      ticketId,
      commentId,
      input,
    );
  }

  @Delete(':projectId/tickets/:ticketId/comments/:commentId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse()
  removeTicketComment(
    @Session() session: UserSession<Auth>,
    @Headers() headers: IncomingHttpHeaders,
    @Param('organizationId') organizationId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('ticketId', ParseUUIDPipe) ticketId: string,
    @Param('commentId', ParseUUIDPipe) commentId: string,
  ): Promise<void> {
    return this.workflowService.removeComment(
      toOrganizationActorContext(session, headers),
      organizationId,
      projectId,
      ticketId,
      commentId,
    );
  }
}
