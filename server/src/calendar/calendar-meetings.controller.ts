import type { IncomingHttpHeaders } from 'node:http';

import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import type { Auth } from '@/auth/auth';
import { CalendarMeetingContentService } from '@/calendar/calendar-meeting-content.service';
import { CalendarMeetingQueryService } from '@/calendar/calendar-meeting-query.service';
import {
  MeetingDetailDto,
  type MeetingDetailResponse,
  MeetingListDto,
  type MeetingListResponse,
} from '@/calendar/dto/meeting.dto';
import {
  QueryCalendarMeetingsDto,
  type QueryCalendarMeetingsInput,
} from '@/calendar/dto/query-calendar-meetings.dto';
import {
  UpdateMeetingDto,
  type UpdateMeetingInput,
} from '@/calendar/dto/update-meeting.dto';
import {
  UpdateMeetingAgendaDto,
  type UpdateMeetingAgendaInput,
  UpdateMeetingNotesDto,
  type UpdateMeetingNotesInput,
} from '@/calendar/dto/update-meeting-content.dto';
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
@Controller('organizations/:organizationId/calendar/meetings')
@UseGuards(TrustedOriginGuard)
export class CalendarMeetingsController {
  constructor(
    private readonly meetingQueryService: CalendarMeetingQueryService,
    private readonly meetingContentService: CalendarMeetingContentService,
  ) {}

  @Get()
  @ApiOperation({ operationId: 'CalendarController_listMeetings' })
  @ApiOkResponse({ standardSchema: MeetingListDto.schema })
  listMeetings(
    @Session() session: UserSession<Auth>,
    @Headers() headers: IncomingHttpHeaders,
    @Param('organizationId') organizationId: string,
    @Query({ schema: QueryCalendarMeetingsDto.schema })
    query: QueryCalendarMeetingsInput,
  ): Promise<MeetingListResponse> {
    return this.meetingQueryService.listMeetings(
      toOrganizationActorContext(session, headers),
      organizationId,
      query,
    );
  }

  @Get(':meetingId')
  @ApiOperation({ operationId: 'CalendarController_getMeeting' })
  @ApiOkResponse({ standardSchema: MeetingDetailDto.schema })
  getMeeting(
    @Session() session: UserSession<Auth>,
    @Headers() headers: IncomingHttpHeaders,
    @Param('organizationId') organizationId: string,
    @Param('meetingId', ParseUUIDPipe) meetingId: string,
  ): Promise<MeetingDetailResponse> {
    return this.meetingQueryService.getMeeting(
      toOrganizationActorContext(session, headers),
      organizationId,
      meetingId,
    );
  }

  @Patch(':meetingId')
  @ApiOperation({ operationId: 'CalendarController_updateMeeting' })
  @ApiOkResponse({ standardSchema: MeetingDetailDto.schema })
  updateMeeting(
    @Session() session: UserSession<Auth>,
    @Headers() headers: IncomingHttpHeaders,
    @Param('organizationId') organizationId: string,
    @Param('meetingId', ParseUUIDPipe) meetingId: string,
    @Body({ schema: UpdateMeetingDto.schema }) input: UpdateMeetingInput,
  ): Promise<MeetingDetailResponse> {
    return this.meetingContentService.updateMeeting(
      toOrganizationActorContext(session, headers),
      organizationId,
      meetingId,
      input,
    );
  }

  @Patch(':meetingId/agenda')
  @ApiOperation({ operationId: 'CalendarController_updateAgenda' })
  @ApiOkResponse({ standardSchema: MeetingDetailDto.schema })
  updateAgenda(
    @Session() session: UserSession<Auth>,
    @Headers() headers: IncomingHttpHeaders,
    @Param('organizationId') organizationId: string,
    @Param('meetingId', ParseUUIDPipe) meetingId: string,
    @Body({ schema: UpdateMeetingAgendaDto.schema })
    input: UpdateMeetingAgendaInput,
  ): Promise<MeetingDetailResponse> {
    return this.meetingContentService.updateAgenda(
      toOrganizationActorContext(session, headers),
      organizationId,
      meetingId,
      input,
    );
  }

  @Patch(':meetingId/notes')
  @ApiOperation({ operationId: 'CalendarController_updateNotes' })
  @ApiOkResponse({ standardSchema: MeetingDetailDto.schema })
  updateNotes(
    @Session() session: UserSession<Auth>,
    @Headers() headers: IncomingHttpHeaders,
    @Param('organizationId') organizationId: string,
    @Param('meetingId', ParseUUIDPipe) meetingId: string,
    @Body({ schema: UpdateMeetingNotesDto.schema })
    input: UpdateMeetingNotesInput,
  ): Promise<MeetingDetailResponse> {
    return this.meetingContentService.updateNotes(
      toOrganizationActorContext(session, headers),
      organizationId,
      meetingId,
      input,
    );
  }
}
