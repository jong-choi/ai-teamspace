import type { IncomingHttpHeaders } from 'node:http';

import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import type { Auth } from '@/auth/auth';
import { TrustedOriginGuard } from '@/common/http/trusted-origin.guard';
import { toOrganizationActorContext } from '@/organizations/organization-actor-context';
import {
  MoveTicketDto,
  type MoveTicketInput,
  MoveTicketResultDto,
} from '@/projects/dto/move-ticket.dto';
import { TicketOrderingService } from '@/projects/ticket-ordering.service';

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
export class TicketOrderingController {
  constructor(private readonly orderingService: TicketOrderingService) {}

  @Post(':projectId/tickets/:ticketId/move')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ operationId: 'TicketWorkflowController_moveTicket' })
  @ApiOkResponse({ standardSchema: MoveTicketResultDto.schema })
  moveTicket(
    @Session() session: UserSession<Auth>,
    @Headers() headers: IncomingHttpHeaders,
    @Param('organizationId') organizationId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('ticketId', ParseUUIDPipe) ticketId: string,
    @Body({ schema: MoveTicketDto.schema }) input: MoveTicketInput,
  ): Promise<MoveTicketResultDto> {
    return this.orderingService.moveTicket(
      toOrganizationActorContext(session, headers),
      organizationId,
      projectId,
      ticketId,
      input,
    );
  }
}
