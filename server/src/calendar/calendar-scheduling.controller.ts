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
import {
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import type { Auth } from '@/auth/auth';
import { CalendarAvailabilityService } from '@/calendar/calendar-availability.service';
import { CalendarSchedulingService } from '@/calendar/calendar-scheduling.service';
import {
  type CalendarAvailabilityRequest,
  CalendarAvailabilityRequestDto,
  type CalendarAvailabilityResponse,
  CalendarAvailabilityResponseDto,
  type CalendarRescheduleAvailabilityRequest,
  CalendarRescheduleAvailabilityRequestDto,
} from '@/calendar/dto/calendar-availability.dto';
import {
  CancelMeetingDto,
  type CancelMeetingInput,
} from '@/calendar/dto/cancel-meeting.dto';
import {
  CreateMeetingDto,
  type CreateMeetingInput,
} from '@/calendar/dto/create-meeting.dto';
import {
  MeetingDetailDto,
  type MeetingDetailResponse,
} from '@/calendar/dto/meeting.dto';
import {
  RescheduleMeetingDto,
  type RescheduleMeetingInput,
} from '@/calendar/dto/reschedule-meeting.dto';
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
@Controller('organizations/:organizationId/calendar')
@UseGuards(TrustedOriginGuard)
export class CalendarSchedulingController {
  constructor(
    private readonly availabilityService: CalendarAvailabilityService,
    private readonly schedulingService: CalendarSchedulingService,
  ) {}

  @Post('availability')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ operationId: 'CalendarController_previewAvailability' })
  @ApiOkResponse({ standardSchema: CalendarAvailabilityResponseDto.schema })
  previewAvailability(
    @Session() session: UserSession<Auth>,
    @Headers() headers: IncomingHttpHeaders,
    @Param('organizationId') organizationId: string,
    @Body({ schema: CalendarAvailabilityRequestDto.schema })
    input: CalendarAvailabilityRequest,
  ): Promise<CalendarAvailabilityResponse> {
    return this.availabilityService.previewAvailability(
      toOrganizationActorContext(session, headers),
      organizationId,
      input,
    );
  }

  @Post('meetings')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ operationId: 'CalendarController_createMeeting' })
  @ApiCreatedResponse({ standardSchema: MeetingDetailDto.schema })
  createMeeting(
    @Session() session: UserSession<Auth>,
    @Headers() headers: IncomingHttpHeaders,
    @Param('organizationId') organizationId: string,
    @Body({ schema: CreateMeetingDto.schema }) input: CreateMeetingInput,
  ): Promise<MeetingDetailResponse> {
    return this.schedulingService.createMeeting(
      toOrganizationActorContext(session, headers),
      organizationId,
      input,
    );
  }

  @Post('meetings/:meetingId/availability')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: 'CalendarController_previewRescheduleAvailability',
  })
  @ApiOkResponse({ standardSchema: CalendarAvailabilityResponseDto.schema })
  previewRescheduleAvailability(
    @Session() session: UserSession<Auth>,
    @Headers() headers: IncomingHttpHeaders,
    @Param('organizationId') organizationId: string,
    @Param('meetingId', ParseUUIDPipe) meetingId: string,
    @Body({ schema: CalendarRescheduleAvailabilityRequestDto.schema })
    input: CalendarRescheduleAvailabilityRequest,
  ): Promise<CalendarAvailabilityResponse> {
    return this.availabilityService.previewRescheduleAvailability(
      toOrganizationActorContext(session, headers),
      organizationId,
      meetingId,
      input,
    );
  }

  @Post('meetings/:meetingId/reschedule')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ operationId: 'CalendarController_rescheduleMeeting' })
  @ApiOkResponse({ standardSchema: MeetingDetailDto.schema })
  rescheduleMeeting(
    @Session() session: UserSession<Auth>,
    @Headers() headers: IncomingHttpHeaders,
    @Param('organizationId') organizationId: string,
    @Param('meetingId', ParseUUIDPipe) meetingId: string,
    @Body({ schema: RescheduleMeetingDto.schema })
    input: RescheduleMeetingInput,
  ): Promise<MeetingDetailResponse> {
    return this.schedulingService.rescheduleMeeting(
      toOrganizationActorContext(session, headers),
      organizationId,
      meetingId,
      input,
    );
  }

  @Post('meetings/:meetingId/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ operationId: 'CalendarController_cancelMeeting' })
  @ApiOkResponse({ standardSchema: MeetingDetailDto.schema })
  cancelMeeting(
    @Session() session: UserSession<Auth>,
    @Headers() headers: IncomingHttpHeaders,
    @Param('organizationId') organizationId: string,
    @Param('meetingId', ParseUUIDPipe) meetingId: string,
    @Body({ schema: CancelMeetingDto.schema }) input: CancelMeetingInput,
  ): Promise<MeetingDetailResponse> {
    return this.schedulingService.cancelMeeting(
      toOrganizationActorContext(session, headers),
      organizationId,
      meetingId,
      input,
    );
  }
}
