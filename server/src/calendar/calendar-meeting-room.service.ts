import { Inject, Injectable } from '@nestjs/common';

import { CalendarMeetingRoomNotFoundError } from '@/calendar/domain/calendar.error';
import type { MeetingRoom } from '@/calendar/domain/meeting-room';
import type { CreateMeetingRoomInput } from '@/calendar/dto/create-meeting-room.dto';
import {
  type MeetingRoomListResponse,
  MeetingRoomListSchema,
  type MeetingRoomResponse,
  toMeetingRoomResponse,
} from '@/calendar/dto/meeting-room.dto';
import type { UpdateMeetingRoomInput } from '@/calendar/dto/update-meeting-room.dto';
import { MeetingRoomRepository } from '@/calendar/infrastructure/persistence/meeting-room.repository';
import type { OrganizationActorContext } from '@/organizations/organization-actor-context';
import { OrganizationsService } from '@/organizations/organizations.service';

type CalendarOrganizationsAccess = Pick<
  OrganizationsService,
  'getDetail' | 'assertAdministrativeAccess'
>;

@Injectable()
export class CalendarMeetingRoomService {
  constructor(
    private readonly meetingRoomRepository: MeetingRoomRepository,
    @Inject(OrganizationsService)
    private readonly organizationsService: CalendarOrganizationsAccess,
  ) {}

  async listMeetingRooms(
    context: OrganizationActorContext,
    organizationId: MeetingRoom['organizationId'],
  ): Promise<MeetingRoomListResponse> {
    await this.organizationsService.getDetail(context, organizationId);
    return MeetingRoomListSchema.parse({
      items: (
        await this.meetingRoomRepository.listMeetingRooms(organizationId)
      ).map(toMeetingRoomResponse),
    });
  }

  async getMeetingRoom(
    context: OrganizationActorContext,
    organizationId: MeetingRoom['organizationId'],
    meetingRoomId: MeetingRoom['id'],
  ): Promise<MeetingRoomResponse> {
    await this.organizationsService.getDetail(context, organizationId);
    const room = await this.meetingRoomRepository.findMeetingRoomById(
      organizationId,
      meetingRoomId,
    );
    if (!room) throw new CalendarMeetingRoomNotFoundError();
    return toMeetingRoomResponse(room);
  }

  async createMeetingRoom(
    context: OrganizationActorContext,
    organizationId: MeetingRoom['organizationId'],
    input: CreateMeetingRoomInput,
  ): Promise<MeetingRoomResponse> {
    await this.organizationsService.assertAdministrativeAccess(
      context,
      organizationId,
    );
    return toMeetingRoomResponse(
      await this.meetingRoomRepository.createMeetingRoom(organizationId, input),
    );
  }

  async updateMeetingRoom(
    context: OrganizationActorContext,
    organizationId: MeetingRoom['organizationId'],
    meetingRoomId: MeetingRoom['id'],
    input: UpdateMeetingRoomInput,
  ): Promise<MeetingRoomResponse> {
    await this.organizationsService.assertAdministrativeAccess(
      context,
      organizationId,
    );
    const room = await this.meetingRoomRepository.updateMeetingRoom(
      organizationId,
      meetingRoomId,
      input,
    );
    if (!room) throw new CalendarMeetingRoomNotFoundError();
    return toMeetingRoomResponse(room);
  }
}
