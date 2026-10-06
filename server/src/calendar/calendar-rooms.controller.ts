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
  UseGuards,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import type { Auth } from '@/auth/auth';
import { CalendarService } from '@/calendar/calendar.service';
import {
  CreateMeetingRoomDto,
  type CreateMeetingRoomInput,
} from '@/calendar/dto/create-meeting-room.dto';
import {
  MeetingRoomDto,
  MeetingRoomListDto,
  type MeetingRoomListResponse,
  type MeetingRoomResponse,
} from '@/calendar/dto/meeting-room.dto';
import {
  UpdateMeetingRoomDto,
  type UpdateMeetingRoomInput,
} from '@/calendar/dto/update-meeting-room.dto';
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
@Controller('organizations/:organizationId/calendar/rooms')
@UseGuards(TrustedOriginGuard)
export class CalendarRoomsController {
  constructor(private readonly calendarService: CalendarService) {}

  @Get()
  @ApiOperation({ operationId: 'CalendarController_listMeetingRooms' })
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

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ operationId: 'CalendarController_createMeetingRoom' })
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

  @Get(':roomId')
  @ApiOperation({ operationId: 'CalendarController_getMeetingRoom' })
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

  @Patch(':roomId')
  @ApiOperation({ operationId: 'CalendarController_updateMeetingRoom' })
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
