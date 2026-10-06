import type { IncomingHttpHeaders } from 'node:http';

import {
  Body,
  Controller,
  Headers,
  Param,
  ParseUUIDPipe,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import type { Auth } from '@/auth/auth';
import { CalendarSchedulingService } from '@/calendar/calendar-scheduling.service';
import {
  MeetingDetailDto,
  type MeetingDetailResponse,
} from '@/calendar/dto/meeting.dto';
import {
  RsvpMeetingDto,
  type RsvpMeetingInput,
} from '@/calendar/dto/rsvp-meeting.dto';
import {
  UpdateMeetingAttendeesDto,
  type UpdateMeetingAttendeesInput,
} from '@/calendar/dto/update-meeting-attendees.dto';
import { TrustedOriginGuard } from '@/common/http/trusted-origin.guard';
import { toOrganizationActorContext } from '@/organizations/organization-actor-context';

import { Session, type UserSession } from '@thallesp/nestjs-better-auth';
import { ApiProblemResponse } from 'nest-problem-details-filter/swagger';

const problemDetailsSchema = { $ref: '#/components/schemas/ProblemDetails' };

@ApiTags('calendar')
@ApiProblemResponse({ status: 400, schema: problemDetailsSchema })
@ApiProblemResponse({ status: 401, schema: problemDetailsSchema })
@ApiProblemResponse({ status: 403, schema: problemDetailsSchema })
@ApiProblemResponse({ status: 404, schema: problemDetailsSchema })
@ApiProblemResponse({ status: 409, schema: problemDetailsSchema })
@ApiProblemResponse({ status: 500, schema: problemDetailsSchema })
@Controller('organizations/:organizationId/calendar/meetings/:meetingId')
@UseGuards(TrustedOriginGuard)
export class CalendarParticipationController {
  constructor(private readonly schedulingService: CalendarSchedulingService) {}

  @Put('rsvp')
  @ApiOperation({ operationId: 'CalendarController_updateRsvp' })
  @ApiOkResponse({ standardSchema: MeetingDetailDto.schema })
  updateRsvp(
    @Session() session: UserSession<Auth>,
    @Headers() headers: IncomingHttpHeaders,
    @Param('organizationId') organizationId: string,
    @Param('meetingId', ParseUUIDPipe) meetingId: string,
    @Body({ schema: RsvpMeetingDto.schema }) input: RsvpMeetingInput,
  ): Promise<MeetingDetailResponse> {
    return this.schedulingService.updateRsvp(
      toOrganizationActorContext(session, headers),
      organizationId,
      meetingId,
      input,
    );
  }

  @Put('attendees')
  @ApiOperation({ operationId: 'CalendarController_replaceAttendees' })
  @ApiOkResponse({ standardSchema: MeetingDetailDto.schema })
  replaceAttendees(
    @Session() session: UserSession<Auth>,
    @Headers() headers: IncomingHttpHeaders,
    @Param('organizationId') organizationId: string,
    @Param('meetingId', ParseUUIDPipe) meetingId: string,
    @Body({ schema: UpdateMeetingAttendeesDto.schema })
    input: UpdateMeetingAttendeesInput,
  ): Promise<MeetingDetailResponse> {
    return this.schedulingService.replaceAttendees(
      toOrganizationActorContext(session, headers),
      organizationId,
      meetingId,
      input,
    );
  }
}
