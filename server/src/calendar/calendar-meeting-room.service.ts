import { Inject, Injectable } from '@nestjs/common';

import { CalendarMeetingRoomNotFoundError } from '@/calendar/domain/calendar.error';
import type { CreateMeetingRoomInput } from '@/calendar/dto/create-meeting-room.dto';
import {
  type MeetingRoomListResponse,
  MeetingRoomListSchema,
  type MeetingRoomResponse,
  toMeetingRoomResponse,
} from '@/calendar/dto/meeting-room.dto';
import type { UpdateMeetingRoomInput } from '@/calendar/dto/update-meeting-room.dto';
import { CalendarRepository } from '@/calendar/infrastructure/persistence/calendar.repository';
import type { OrganizationActorContext } from '@/organizations/organization-actor-context';
import { OrganizationsService } from '@/organizations/organizations.service';

type CalendarOrganizationsAccess = Pick<
  OrganizationsService,
  'getDetail' | 'assertAdministrativeAccess'
>;

@Injectable()
export class CalendarMeetingRoomService {
  constructor(
    private readonly calendarRepository: CalendarRepository,
    @Inject(OrganizationsService)
    private readonly organizationsService: CalendarOrganizationsAccess,
  ) {}

  async listMeetingRooms(
    context: OrganizationActorContext,
    organizationId: string,
  ): Promise<MeetingRoomListResponse> {
    await this.organizationsService.getDetail(context, organizationId);
    return MeetingRoomListSchema.parse({
      items: (
        await this.calendarRepository.listMeetingRooms(organizationId)
      ).map(toMeetingRoomResponse),
    });
  }

  async getMeetingRoom(
    context: OrganizationActorContext,
    organizationId: string,
    meetingRoomId: string,
  ): Promise<MeetingRoomResponse> {
    await this.organizationsService.getDetail(context, organizationId);
    const room = await this.calendarRepository.findMeetingRoomById(
      organizationId,
      meetingRoomId,
    );
    if (!room) throw new CalendarMeetingRoomNotFoundError();
    return toMeetingRoomResponse(room);
  }

  async createMeetingRoom(
    context: OrganizationActorContext,
    organizationId: string,
    input: CreateMeetingRoomInput,
  ): Promise<MeetingRoomResponse> {
    await this.organizationsService.assertAdministrativeAccess(
      context,
      organizationId,
    );
    return toMeetingRoomResponse(
      await this.calendarRepository.createMeetingRoom({
        organizationId,
        name: input.name,
        capacity: input.capacity,
        floor: input.floor ?? null,
        description: input.description ?? null,
      }),
    );
  }

  async updateMeetingRoom(
    context: OrganizationActorContext,
    organizationId: string,
    meetingRoomId: string,
    input: UpdateMeetingRoomInput,
  ): Promise<MeetingRoomResponse> {
    await this.organizationsService.assertAdministrativeAccess(
      context,
      organizationId,
    );
    const changes: Parameters<
      CalendarRepository['updateMeetingRoom']
    >[0]['changes'] = {};
    if (input.name !== undefined) changes.name = input.name;
    if (input.capacity !== undefined) changes.capacity = input.capacity;
    if (input.floor !== undefined) changes.floor = input.floor;
    if (input.description !== undefined) {
      changes.description = input.description;
    }
    if (input.active !== undefined) changes.active = input.active;

    const room = await this.calendarRepository.updateMeetingRoom({
      organizationId,
      meetingRoomId,
      changes,
    });
    if (!room) throw new CalendarMeetingRoomNotFoundError();
    return toMeetingRoomResponse(room);
  }
}
