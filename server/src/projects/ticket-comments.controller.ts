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
  CreateTicketCommentDto,
  type CreateTicketCommentInput,
} from '@/projects/dto/create-ticket-comment.dto';
import {
  TicketCommentDto,
  TicketCommentListDto,
} from '@/projects/dto/ticket-comment.dto';
import {
  UpdateTicketCommentDto,
  type UpdateTicketCommentInput,
} from '@/projects/dto/update-ticket-comment.dto';
import { TicketCommentsService } from '@/projects/ticket-comments.service';

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
export class TicketCommentsController {
  constructor(private readonly commentsService: TicketCommentsService) {}

  @Get(':projectId/tickets/:ticketId/comments')
  @ApiOperation({ operationId: 'TicketWorkflowController_listTicketComments' })
  @ApiOkResponse({ standardSchema: TicketCommentListDto.schema })
  listTicketComments(
    @Session() session: UserSession<Auth>,
    @Headers() headers: IncomingHttpHeaders,
    @Param('organizationId') organizationId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('ticketId', ParseUUIDPipe) ticketId: string,
  ): Promise<TicketCommentListDto> {
    return this.commentsService.listComments(
      toOrganizationActorContext(session, headers),
      organizationId,
      projectId,
      ticketId,
    );
  }

  @Post(':projectId/tickets/:ticketId/comments')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ operationId: 'TicketWorkflowController_createTicketComment' })
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
    return this.commentsService.createComment(
      toOrganizationActorContext(session, headers),
      organizationId,
      projectId,
      ticketId,
      input,
    );
  }

  @Patch(':projectId/tickets/:ticketId/comments/:commentId')
  @ApiOperation({ operationId: 'TicketWorkflowController_updateTicketComment' })
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
    return this.commentsService.updateComment(
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
  @ApiOperation({ operationId: 'TicketWorkflowController_removeTicketComment' })
  @ApiNoContentResponse()
  removeTicketComment(
    @Session() session: UserSession<Auth>,
    @Headers() headers: IncomingHttpHeaders,
    @Param('organizationId') organizationId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('ticketId', ParseUUIDPipe) ticketId: string,
    @Param('commentId', ParseUUIDPipe) commentId: string,
  ): Promise<void> {
    return this.commentsService.removeComment(
      toOrganizationActorContext(session, headers),
      organizationId,
      projectId,
      ticketId,
      commentId,
    );
  }
}
