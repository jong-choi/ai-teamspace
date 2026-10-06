import { Inject, Injectable, Logger } from '@nestjs/common';

import { CalendarMeetingLoader } from '@/calendar/calendar-meeting.loader';
import { CalendarMeetingPolicy } from '@/calendar/calendar-meeting.policy';
import { CalendarMeetingPresenterService } from '@/calendar/calendar-meeting-presenter.service';
import {
  CalendarMeetingNotFoundError,
  CalendarMeetingRoomNotFoundError,
} from '@/calendar/domain/calendar.error';
import type { Meeting } from '@/calendar/domain/meeting';
import type { CreateMeetingRoomInput } from '@/calendar/dto/create-meeting-room.dto';
import type {
  MeetingDetailResponse,
  MeetingListResponse,
} from '@/calendar/dto/meeting.dto';
import {
  type MeetingRoomListResponse,
  MeetingRoomListSchema,
  type MeetingRoomResponse,
  toMeetingRoomResponse,
} from '@/calendar/dto/meeting-room.dto';
import type { QueryCalendarMeetingsInput } from '@/calendar/dto/query-calendar-meetings.dto';
import type { UpdateMeetingInput } from '@/calendar/dto/update-meeting.dto';
import type {
  UpdateMeetingAgendaInput,
  UpdateMeetingNotesInput,
} from '@/calendar/dto/update-meeting-content.dto';
import type { UpdateMeetingRoomInput } from '@/calendar/dto/update-meeting-room.dto';
import { CalendarRepository } from '@/calendar/infrastructure/persistence/calendar.repository';
import { CalendarProjectReferenceProvider } from '@/calendar/infrastructure/project/calendar-project-reference.provider';
import { CalendarReminderScheduler } from '@/calendar/infrastructure/reminder/calendar-reminder-scheduler.provider';
import type { OrganizationActorContext } from '@/organizations/organization-actor-context';
import { OrganizationsService } from '@/organizations/organizations.service';

type CalendarOrganizationsAccess = Pick<
  OrganizationsService,
  'getDetail' | 'searchMemberUserIds' | 'assertAdministrativeAccess'
>;

type CalendarMeetingPresenter = Pick<
  CalendarMeetingPresenterService,
  'presentList' | 'presentDetail'
>;

@Injectable()
export class CalendarService {
  private readonly logger = new Logger(CalendarService.name);

  constructor(
    private readonly calendarRepository: CalendarRepository,
    private readonly meetingLoader: CalendarMeetingLoader,
    private readonly meetingPolicy: CalendarMeetingPolicy,
    @Inject(CalendarMeetingPresenterService)
    private readonly presenter: CalendarMeetingPresenter,
    private readonly projectReferenceProvider: CalendarProjectReferenceProvider,
    private readonly reminderScheduler: CalendarReminderScheduler,
    @Inject(OrganizationsService)
    private readonly organizationsService: CalendarOrganizationsAccess,
  ) {}

  async listMeetings(
    context: OrganizationActorContext,
    organizationId: string,
    query: QueryCalendarMeetingsInput,
  ): Promise<MeetingListResponse> {
    await this.organizationsService.getDetail(context, organizationId);
    const from = new Date(query.from);
    const to = new Date(query.to);
    this.meetingPolicy.assertTimeRange(from, to);

    const searchParticipantUserIds = query.search
      ? await this.organizationsService.searchMemberUserIds(
          context,
          organizationId,
          query.search,
        )
      : undefined;
    const records = await this.calendarRepository.listMeetingsInRange({
      organizationId,
      from,
      to,
      category: query.category,
      projectId: query.projectId,
      attendeeUserId: query.attendeeUserId,
      roomId: query.roomId,
      search: query.search,
      searchParticipantUserIds,
    });

    return this.presenter.presentList(organizationId, records);
  }

  async getMeeting(
    context: OrganizationActorContext,
    organizationId: string,
    meetingId: string,
  ): Promise<MeetingDetailResponse> {
    await this.organizationsService.getDetail(context, organizationId);
    return this.presenter.presentDetail(
      organizationId,
      await this.meetingLoader.requireMeeting(organizationId, meetingId),
    );
  }

  async updateMeeting(
    context: OrganizationActorContext,
    organizationId: string,
    meetingId: string,
    input: UpdateMeetingInput,
  ): Promise<MeetingDetailResponse> {
    await this.organizationsService.getDetail(context, organizationId);
    const current = await this.meetingLoader.requireMeeting(
      organizationId,
      meetingId,
    );
    this.meetingPolicy.assertActive(current);
    await this.meetingPolicy.assertModificationAccess(
      context,
      organizationId,
      current,
    );

    const changes: Parameters<
      CalendarRepository['editMeetingDetails']
    >[0]['changes'] = {};
    if (input.title !== undefined && input.title !== current.meeting.title) {
      changes.title = input.title;
    }
    if (
      input.category !== undefined &&
      input.category !== current.meeting.category
    ) {
      changes.category = input.category;
    }
    if (
      input.projectId !== undefined &&
      input.projectId !== current.meeting.projectId
    ) {
      if (input.projectId !== null) {
        await this.projectReferenceProvider.assertReference(
          organizationId,
          input.projectId,
        );
      }
      changes.projectId = input.projectId;
    }
    if (
      input.reminderMinutes !== undefined &&
      input.reminderMinutes !== current.meeting.reminderMinutes
    ) {
      changes.reminderMinutes = input.reminderMinutes;
    }
    if (Object.keys(changes).length === 0) {
      return this.presenter.presentDetail(organizationId, current);
    }

    const updated = await this.calendarRepository.editMeetingDetails({
      organizationId,
      meetingId,
      changes,
    });
    if (!updated) throw new CalendarMeetingNotFoundError();
    if (changes.reminderMinutes !== undefined) {
      await this.syncReminder(updated.meeting);
    }
    return this.presenter.presentDetail(organizationId, updated);
  }

  async updateAgenda(
    context: OrganizationActorContext,
    organizationId: string,
    meetingId: string,
    input: UpdateMeetingAgendaInput,
  ): Promise<MeetingDetailResponse> {
    await this.organizationsService.getDetail(context, organizationId);
    const current = await this.meetingLoader.requireMeeting(
      organizationId,
      meetingId,
    );
    this.meetingPolicy.assertActive(current);
    await this.meetingPolicy.assertModificationAccess(
      context,
      organizationId,
      current,
    );
    if (input.agendaMarkdown === current.meeting.agendaMarkdown) {
      return this.presenter.presentDetail(organizationId, current);
    }
    const updated = await this.calendarRepository.updateMeetingAgenda(
      organizationId,
      meetingId,
      input.agendaMarkdown,
    );
    if (!updated) throw new CalendarMeetingNotFoundError();
    return this.presenter.presentDetail(organizationId, updated);
  }

  async updateNotes(
    context: OrganizationActorContext,
    organizationId: string,
    meetingId: string,
    input: UpdateMeetingNotesInput,
  ): Promise<MeetingDetailResponse> {
    await this.organizationsService.getDetail(context, organizationId);
    const current = await this.meetingLoader.requireMeeting(
      organizationId,
      meetingId,
    );
    this.meetingPolicy.assertActive(current);
    await this.meetingPolicy.assertModificationAccess(
      context,
      organizationId,
      current,
    );
    if (input.notesMarkdown === current.meeting.notesMarkdown) {
      return this.presenter.presentDetail(organizationId, current);
    }
    const updated = await this.calendarRepository.updateMeetingNotes(
      organizationId,
      meetingId,
      input.notesMarkdown,
    );
    if (!updated) throw new CalendarMeetingNotFoundError();
    return this.presenter.presentDetail(organizationId, updated);
  }

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

  private async syncReminder(meeting: Meeting): Promise<void> {
    try {
      await this.reminderScheduler.sync([meeting]);
    } catch (error) {
      this.logger.error(
        'Meeting은 저장되었지만 reminder queue 동기화에 실패했습니다.',
        error,
      );
    }
  }
}
