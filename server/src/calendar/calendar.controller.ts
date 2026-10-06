import type { IncomingHttpHeaders } from 'node:http';

import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';

import type { Auth } from '@/auth/auth';
import { CalendarService } from '@/calendar/calendar.service';
import { CalendarIcsService } from '@/calendar/calendar-ics.service';
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
  CreateMeetingRoomDto,
  type CreateMeetingRoomInput,
} from '@/calendar/dto/create-meeting-room.dto';
import {
  MeetingDetailDto,
  type MeetingDetailResponse,
  MeetingListDto,
  type MeetingListResponse,
} from '@/calendar/dto/meeting.dto';
import {
  MeetingRoomDto,
  MeetingRoomListDto,
  type MeetingRoomListResponse,
  type MeetingRoomResponse,
} from '@/calendar/dto/meeting-room.dto';
import {
  QueryCalendarMeetingsDto,
  type QueryCalendarMeetingsInput,
} from '@/calendar/dto/query-calendar-meetings.dto';
import {
  RescheduleMeetingDto,
  type RescheduleMeetingInput,
} from '@/calendar/dto/reschedule-meeting.dto';
import {
  RsvpMeetingDto,
  type RsvpMeetingInput,
} from '@/calendar/dto/rsvp-meeting.dto';
import {
  UpdateMeetingDto,
  type UpdateMeetingInput,
} from '@/calendar/dto/update-meeting.dto';
import {
  UpdateMeetingAttendeesDto,
  type UpdateMeetingAttendeesInput,
} from '@/calendar/dto/update-meeting-attendees.dto';
import {
  UpdateMeetingAgendaDto,
  type UpdateMeetingAgendaInput,
  UpdateMeetingNotesDto,
  type UpdateMeetingNotesInput,
} from '@/calendar/dto/update-meeting-content.dto';
import {
  UpdateMeetingRoomDto,
  type UpdateMeetingRoomInput,
} from '@/calendar/dto/update-meeting-room.dto';
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
@Controller('organizations/:organizationId/calendar')
@UseGuards(TrustedOriginGuard)
export class CalendarController {
  constructor(
    private readonly calendarService: CalendarService,
    private readonly schedulingService: CalendarSchedulingService,
    private readonly icsService: CalendarIcsService,
  ) {}

  @Get('meetings')
  @ApiOkResponse({ standardSchema: MeetingListDto.schema })
  listMeetings(
    @Session() session: UserSession<Auth>,
    @Headers() headers: IncomingHttpHeaders,
    @Param('organizationId') organizationId: string,
    @Query({ schema: QueryCalendarMeetingsDto.schema })
    query: QueryCalendarMeetingsInput,
  ): Promise<MeetingListResponse> {
    return this.calendarService.listMeetings(
      toOrganizationActorContext(session, headers),
      organizationId,
      query,
    );
  }

  @Post('availability')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ standardSchema: CalendarAvailabilityResponseDto.schema })
  previewAvailability(
    @Session() session: UserSession<Auth>,
    @Headers() headers: IncomingHttpHeaders,
    @Param('organizationId') organizationId: string,
    @Body({ schema: CalendarAvailabilityRequestDto.schema })
    input: CalendarAvailabilityRequest,
  ): Promise<CalendarAvailabilityResponse> {
    return this.schedulingService.previewAvailability(
      toOrganizationActorContext(session, headers),
      organizationId,
      input,
    );
  }

  @Post('meetings')
  @HttpCode(HttpStatus.CREATED)
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

  @Get('meetings/:meetingId')
  @ApiOkResponse({ standardSchema: MeetingDetailDto.schema })
  getMeeting(
    @Session() session: UserSession<Auth>,
    @Headers() headers: IncomingHttpHeaders,
    @Param('organizationId') organizationId: string,
    @Param('meetingId', ParseUUIDPipe) meetingId: string,
  ): Promise<MeetingDetailResponse> {
    return this.calendarService.getMeeting(
      toOrganizationActorContext(session, headers),
      organizationId,
      meetingId,
    );
  }

  @Patch('meetings/:meetingId')
  @ApiOkResponse({ standardSchema: MeetingDetailDto.schema })
  updateMeeting(
    @Session() session: UserSession<Auth>,
    @Headers() headers: IncomingHttpHeaders,
    @Param('organizationId') organizationId: string,
    @Param('meetingId', ParseUUIDPipe) meetingId: string,
    @Body({ schema: UpdateMeetingDto.schema }) input: UpdateMeetingInput,
  ): Promise<MeetingDetailResponse> {
    return this.calendarService.updateMeeting(
      toOrganizationActorContext(session, headers),
      organizationId,
      meetingId,
      input,
    );
  }

  @Post('meetings/:meetingId/availability')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ standardSchema: CalendarAvailabilityResponseDto.schema })
  previewRescheduleAvailability(
    @Session() session: UserSession<Auth>,
    @Headers() headers: IncomingHttpHeaders,
    @Param('organizationId') organizationId: string,
    @Param('meetingId', ParseUUIDPipe) meetingId: string,
    @Body({ schema: CalendarRescheduleAvailabilityRequestDto.schema })
    input: CalendarRescheduleAvailabilityRequest,
  ): Promise<CalendarAvailabilityResponse> {
    return this.schedulingService.previewRescheduleAvailability(
      toOrganizationActorContext(session, headers),
      organizationId,
      meetingId,
      input,
    );
  }

  @Post('meetings/:meetingId/reschedule')
  @HttpCode(HttpStatus.OK)
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

  @Put('meetings/:meetingId/rsvp')
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

  @Put('meetings/:meetingId/attendees')
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

  @Patch('meetings/:meetingId/agenda')
  @ApiOkResponse({ standardSchema: MeetingDetailDto.schema })
  updateAgenda(
    @Session() session: UserSession<Auth>,
    @Headers() headers: IncomingHttpHeaders,
    @Param('organizationId') organizationId: string,
    @Param('meetingId', ParseUUIDPipe) meetingId: string,
    @Body({ schema: UpdateMeetingAgendaDto.schema })
    input: UpdateMeetingAgendaInput,
  ): Promise<MeetingDetailResponse> {
    return this.calendarService.updateAgenda(
      toOrganizationActorContext(session, headers),
      organizationId,
      meetingId,
      input,
    );
  }

  @Patch('meetings/:meetingId/notes')
  @ApiOkResponse({ standardSchema: MeetingDetailDto.schema })
  updateNotes(
    @Session() session: UserSession<Auth>,
    @Headers() headers: IncomingHttpHeaders,
    @Param('organizationId') organizationId: string,
    @Param('meetingId', ParseUUIDPipe) meetingId: string,
    @Body({ schema: UpdateMeetingNotesDto.schema })
    input: UpdateMeetingNotesInput,
  ): Promise<MeetingDetailResponse> {
    return this.calendarService.updateNotes(
      toOrganizationActorContext(session, headers),
      organizationId,
      meetingId,
      input,
    );
  }

  @Get('meetings/:meetingId/ics')
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

  @Get('rooms')
  @ApiOkResponse({ standardSchema: MeetingRoomListDto.schema })
  listMeetingRooms(
    @Session() session: UserSession<Auth>,
    @Headers() headers: IncomingHttpHeaders,
    @Param('organizationId') organizationId: string,
  ): Promise<MeetingRoomListResponse> {
    return this.calendarService.listMeetingRooms(
      toOrganizationActorContext(session, headers),
      organizationId,
    );
  }

  @Post('rooms')
  @HttpCode(HttpStatus.CREATED)
  @ApiCreatedResponse({ standardSchema: MeetingRoomDto.schema })
  createMeetingRoom(
    @Session() session: UserSession<Auth>,
    @Headers() headers: IncomingHttpHeaders,
    @Param('organizationId') organizationId: string,
    @Body({ schema: CreateMeetingRoomDto.schema })
    input: CreateMeetingRoomInput,
  ): Promise<MeetingRoomResponse> {
    return this.calendarService.createMeetingRoom(
      toOrganizationActorContext(session, headers),
      organizationId,
      input,
    );
  }

  @Get('rooms/:roomId')
  @ApiOkResponse({ standardSchema: MeetingRoomDto.schema })
  getMeetingRoom(
    @Session() session: UserSession<Auth>,
    @Headers() headers: IncomingHttpHeaders,
    @Param('organizationId') organizationId: string,
    @Param('roomId', ParseUUIDPipe) roomId: string,
  ): Promise<MeetingRoomResponse> {
    return this.calendarService.getMeetingRoom(
      toOrganizationActorContext(session, headers),
      organizationId,
      roomId,
    );
  }

  @Patch('rooms/:roomId')
  @ApiOkResponse({ standardSchema: MeetingRoomDto.schema })
  updateMeetingRoom(
    @Session() session: UserSession<Auth>,
    @Headers() headers: IncomingHttpHeaders,
    @Param('organizationId') organizationId: string,
    @Param('roomId', ParseUUIDPipe) roomId: string,
    @Body({ schema: UpdateMeetingRoomDto.schema })
    input: UpdateMeetingRoomInput,
  ): Promise<MeetingRoomResponse> {
    return this.calendarService.updateMeetingRoom(
      toOrganizationActorContext(session, headers),
      organizationId,
      roomId,
      input,
    );
  }
}
