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
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import type { Auth } from '@/auth/auth';
import { TrustedOriginGuard } from '@/common/http/trusted-origin.guard';
import { toOrganizationActorContext } from '@/organizations/organization-actor-context';
import {
  CreateTicketLabelDto,
  type CreateTicketLabelInput,
} from '@/projects/dto/create-ticket-label.dto';
import {
  TicketLabelDto,
  TicketLabelListDto,
} from '@/projects/dto/ticket-label.dto';
import {
  UpdateTicketLabelDto,
  type UpdateTicketLabelInput,
} from '@/projects/dto/update-ticket-label.dto';
import { TicketLabelsService } from '@/projects/ticket-labels.service';

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
export class TicketLabelsController {
  constructor(private readonly labelsService: TicketLabelsService) {}

  @Get(':projectId/labels')
  @ApiOperation({ operationId: 'TicketWorkflowController_listProjectLabels' })
  @ApiOkResponse({ standardSchema: TicketLabelListDto.schema })
  listProjectLabels(
    @Session() session: UserSession<Auth>,
    @Headers() headers: IncomingHttpHeaders,
    @Param('organizationId') organizationId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
  ): Promise<TicketLabelListDto> {
    return this.labelsService.listLabels(
      toOrganizationActorContext(session, headers),
      organizationId,
      projectId,
    );
  }

  @Post(':projectId/labels')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ operationId: 'TicketWorkflowController_createProjectLabel' })
  @ApiCreatedResponse({ standardSchema: TicketLabelDto.schema })
  createProjectLabel(
    @Session() session: UserSession<Auth>,
    @Headers() headers: IncomingHttpHeaders,
    @Param('organizationId') organizationId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body({ schema: CreateTicketLabelDto.schema })
    input: CreateTicketLabelInput,
  ): Promise<TicketLabelDto> {
    return this.labelsService.createLabel(
      toOrganizationActorContext(session, headers),
      organizationId,
      projectId,
      input,
    );
  }

  @Patch(':projectId/labels/:labelId')
  @ApiOperation({ operationId: 'TicketWorkflowController_updateProjectLabel' })
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
    return this.labelsService.updateLabel(
      toOrganizationActorContext(session, headers),
      organizationId,
      projectId,
      labelId,
      input,
    );
  }

  @Put(':projectId/tickets/:ticketId/labels/:labelId')
  @ApiOperation({ operationId: 'TicketWorkflowController_attachTicketLabel' })
  @ApiOkResponse({ standardSchema: TicketLabelDto.schema })
  attachTicketLabel(
    @Session() session: UserSession<Auth>,
    @Headers() headers: IncomingHttpHeaders,
    @Param('organizationId') organizationId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('ticketId', ParseUUIDPipe) ticketId: string,
    @Param('labelId', ParseUUIDPipe) labelId: string,
  ): Promise<TicketLabelDto> {
    return this.labelsService.attachLabel(
      toOrganizationActorContext(session, headers),
      organizationId,
      projectId,
      ticketId,
      labelId,
    );
  }

  @Delete(':projectId/tickets/:ticketId/labels/:labelId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ operationId: 'TicketWorkflowController_detachTicketLabel' })
  @ApiNoContentResponse()
  detachTicketLabel(
    @Session() session: UserSession<Auth>,
    @Headers() headers: IncomingHttpHeaders,
    @Param('organizationId') organizationId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('ticketId', ParseUUIDPipe) ticketId: string,
    @Param('labelId', ParseUUIDPipe) labelId: string,
  ): Promise<void> {
    return this.labelsService.detachLabel(
      toOrganizationActorContext(session, headers),
      organizationId,
      projectId,
      ticketId,
      labelId,
    );
  }
}
