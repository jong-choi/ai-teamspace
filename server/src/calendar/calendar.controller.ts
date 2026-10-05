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
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';

import type { Auth } from '#server/auth/auth.js';
import { CalendarService } from '#server/calendar/calendar.service.js';
import {
  CreateMeetingDto,
  type CreateMeetingInput,
} from '#server/calendar/dto/create-meeting.dto.js';
import {
  CreateMeetingRoomDto,
  type CreateMeetingRoomInput,
} from '#server/calendar/dto/create-meeting-room.dto.js';
import {
  MeetingDetailDto,
  type MeetingDetailResponse,
  MeetingListDto,
  type MeetingListResponse,
} from '#server/calendar/dto/meeting.dto.js';
import {
  MeetingRoomDto,
  MeetingRoomListDto,
  type MeetingRoomListResponse,
  type MeetingRoomResponse,
} from '#server/calendar/dto/meeting-room.dto.js';
import {
  QueryCalendarMeetingsDto,
  type QueryCalendarMeetingsInput,
} from '#server/calendar/dto/query-calendar-meetings.dto.js';
import {
  UpdateMeetingDto,
  type UpdateMeetingInput,
} from '#server/calendar/dto/update-meeting.dto.js';
import {
  UpdateMeetingRoomDto,
  type UpdateMeetingRoomInput,
} from '#server/calendar/dto/update-meeting-room.dto.js';
import { TrustedOriginGuard } from '#server/common/http/trusted-origin.guard.js';
import { toOrganizationActorContext } from '#server/organizations/organization-actor-context.js';

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
export class CalendarController {
  constructor(private readonly calendarService: CalendarService) {}

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

  @Post('meetings')
  @HttpCode(HttpStatus.CREATED)
  @ApiCreatedResponse({ standardSchema: MeetingDetailDto.schema })
  createMeeting(
    @Session() session: UserSession<Auth>,
    @Headers() headers: IncomingHttpHeaders,
    @Param('organizationId') organizationId: string,
    @Body({ schema: CreateMeetingDto.schema }) input: CreateMeetingInput,
  ): Promise<MeetingDetailResponse> {
    return this.calendarService.createMeeting(
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
