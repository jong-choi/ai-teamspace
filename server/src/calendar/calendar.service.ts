import { Inject, Injectable, Logger } from '@nestjs/common';

import { CalendarMeetingPresenterService } from '#server/calendar/calendar-meeting-presenter.service.js';
import {
  CalendarInvalidLocationError,
  CalendarInvalidTimeRangeError,
  CalendarMeetingCanceledError,
  CalendarMeetingNotFoundError,
  CalendarMeetingRoomInactiveError,
  CalendarMeetingRoomNotFoundError,
} from '#server/calendar/domain/calendar.error.js';
import type { Meeting } from '#server/calendar/domain/meeting.js';
import type { CreateMeetingRoomInput } from '#server/calendar/dto/create-meeting-room.dto.js';
import type {
  MeetingDetailResponse,
  MeetingListResponse,
} from '#server/calendar/dto/meeting.dto.js';
import {
  type MeetingRoomListResponse,
  MeetingRoomListSchema,
  type MeetingRoomResponse,
  toMeetingRoomResponse,
} from '#server/calendar/dto/meeting-room.dto.js';
import type { QueryCalendarMeetingsInput } from '#server/calendar/dto/query-calendar-meetings.dto.js';
import type { UpdateMeetingInput } from '#server/calendar/dto/update-meeting.dto.js';
import type {
  UpdateMeetingAgendaInput,
  UpdateMeetingNotesInput,
} from '#server/calendar/dto/update-meeting-content.dto.js';
import type { UpdateMeetingRoomInput } from '#server/calendar/dto/update-meeting-room.dto.js';
import {
  type CalendarMeetingDetailRecord,
  CalendarRepository,
} from '#server/calendar/infrastructure/persistence/calendar.repository.js';
import { CalendarProjectReferenceProvider } from '#server/calendar/infrastructure/project/calendar-project-reference.provider.js';
import { CalendarReminderScheduler } from '#server/calendar/infrastructure/reminder/calendar-reminder-scheduler.provider.js';
import type { OrganizationActorContext } from '#server/organizations/organization-actor-context.js';
import { OrganizationsService } from '#server/organizations/organizations.service.js';

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
    this.assertTimeRange(from, to);

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
      await this.requireMeeting(organizationId, meetingId),
    );
  }

  async updateMeeting(
    context: OrganizationActorContext,
    organizationId: string,
    meetingId: string,
    input: UpdateMeetingInput,
  ): Promise<MeetingDetailResponse> {
    await this.organizationsService.getDetail(context, organizationId);
    const current = await this.requireMeeting(organizationId, meetingId);
    this.assertMeetingActive(current);
    await this.assertMeetingModificationAccess(
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
    const current = await this.requireMeeting(organizationId, meetingId);
    this.assertMeetingActive(current);
    await this.assertMeetingModificationAccess(
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
    const current = await this.requireMeeting(organizationId, meetingId);
    this.assertMeetingActive(current);
    await this.assertMeetingModificationAccess(
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

  async requireMeeting(
    organizationId: string,
    meetingId: string,
  ): Promise<CalendarMeetingDetailRecord> {
    const record = await this.calendarRepository.findMeetingById(
      organizationId,
      meetingId,
    );
    if (!record) throw new CalendarMeetingNotFoundError();
    return record;
  }

  async assertMeetingModificationAccess(
    context: OrganizationActorContext,
    organizationId: string,
    record: CalendarMeetingDetailRecord,
  ): Promise<void> {
    if (record.meeting.organizerUserId !== context.userId) {
      await this.organizationsService.assertAdministrativeAccess(
        context,
        organizationId,
      );
    }
  }

  async requireSelectableMeetingRoom(
    organizationId: string,
    meetingRoomId: string,
  ): Promise<void> {
    const room = await this.calendarRepository.findMeetingRoomById(
      organizationId,
      meetingRoomId,
    );
    if (!room) throw new CalendarMeetingRoomNotFoundError();
    if (!room.active) throw new CalendarMeetingRoomInactiveError();
  }

  assertMeetingActive(record: CalendarMeetingDetailRecord): void {
    if (record.meeting.canceledAt) throw new CalendarMeetingCanceledError();
  }

  assertTimeRange(startAt: Date, endAt: Date): void {
    if (endAt.getTime() <= startAt.getTime()) {
      throw new CalendarInvalidTimeRangeError();
    }
  }

  assertLocation(
    locationType: Meeting['locationType'],
    meetingRoomId: string | null,
  ): void {
    if (
      (locationType === 'meeting_room' && meetingRoomId === null) ||
      (locationType !== 'meeting_room' && meetingRoomId !== null)
    ) {
      throw new CalendarInvalidLocationError();
    }
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
