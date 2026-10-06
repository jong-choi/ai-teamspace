import type { IncomingHttpHeaders } from 'node:http';

import {
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import type { Auth } from '@/auth/auth';
import { CalendarIcsService } from '@/calendar/calendar-ics.service';
import { TrustedOriginGuard } from '@/common/http/trusted-origin.guard';
import { toOrganizationActorContext } from '@/organizations/organization-actor-context';

import { Session, type UserSession } from '@thallesp/nestjs-better-auth';
import type { Response } from 'express';
import { ApiProblemResponse } from 'nest-problem-details-filter/swagger';

const problemDetailsSchema = { $ref: '#/components/schemas/ProblemDetails' };

@ApiTags('calendar')
@ApiProblemResponse({ status: 400, schema: problemDetailsSchema })
@ApiProblemResponse({ status: 401, schema: problemDetailsSchema })
@ApiProblemResponse({ status: 403, schema: problemDetailsSchema })
@ApiProblemResponse({ status: 404, schema: problemDetailsSchema })
@ApiProblemResponse({ status: 409, schema: problemDetailsSchema })
@ApiProblemResponse({ status: 500, schema: problemDetailsSchema })
@Controller('organizations/:organizationId/calendar/meetings')
@UseGuards(TrustedOriginGuard)
export class CalendarIcsController {
  constructor(private readonly icsService: CalendarIcsService) {}

  @Get(':meetingId/ics')
  @ApiOperation({ operationId: 'CalendarController_exportIcs' })
  @ApiOkResponse({
    content: {
      'text/calendar': {
        schema: { type: 'string' },
      },
    },
  })
  async exportIcs(
    @Session() session: UserSession<Auth>,
    @Headers() headers: IncomingHttpHeaders,
    @Param('organizationId') organizationId: string,
    @Param('meetingId', ParseUUIDPipe) meetingId: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<string> {
    const document = await this.icsService.exportMeeting(
      toOrganizationActorContext(session, headers),
      organizationId,
      meetingId,
    );
    response.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${document.filename}"`,
    );
    return document.content;
  }
}
