import { Inject, Injectable } from '@nestjs/common';

import {
  AuthUserDirectoryService,
  type AuthUserIdentity,
} from '#server/auth/auth-user-directory.service.js';
import {
  CalendarAttendeeNotMemberError,
  CalendarInvalidLocationError,
  CalendarInvalidTimeRangeError,
  CalendarMeetingNotFoundError,
  CalendarMeetingRoomInactiveError,
  CalendarMeetingRoomNotFoundError,
} from '#server/calendar/domain/calendar.error.js';
import type { CalendarProjectSummary } from '#server/calendar/domain/calendar-project-summary.js';
import type { Meeting } from '#server/calendar/domain/meeting.js';
import type { CreateMeetingInput } from '#server/calendar/dto/create-meeting.dto.js';
import type { CreateMeetingRoomInput } from '#server/calendar/dto/create-meeting-room.dto.js';
import {
  type MeetingDetailResponse,
  MeetingDetailSchema,
  type MeetingListResponse,
  MeetingListSchema,
  type MeetingSummaryResponse,
  type MeetingWireResponse,
} from '#server/calendar/dto/meeting.dto.js';
import {
  type MeetingRoomListResponse,
  MeetingRoomListSchema,
  type MeetingRoomResponse,
  toMeetingRoomResponse,
} from '#server/calendar/dto/meeting-room.dto.js';
import type { QueryCalendarMeetingsInput } from '#server/calendar/dto/query-calendar-meetings.dto.js';
import type { UpdateMeetingInput } from '#server/calendar/dto/update-meeting.dto.js';
import type { UpdateMeetingRoomInput } from '#server/calendar/dto/update-meeting-room.dto.js';
import {
  type CalendarMeetingDetailRecord,
  type CalendarMeetingListRecord,
  CalendarRepository,
} from '#server/calendar/infrastructure/persistence/calendar.repository.js';
import { CalendarProjectReferenceProvider } from '#server/calendar/infrastructure/project/calendar-project-reference.provider.js';
import type { OrganizationUserSummary } from '#server/organizations/domain/organization-member.js';
import type { OrganizationActorContext } from '#server/organizations/organization-actor-context.js';
import { OrganizationsService } from '#server/organizations/organizations.service.js';

type CalendarOrganizationsAccess = Pick<
  OrganizationsService,
  | 'getDetail'
  | 'listMembersByUserIds'
  | 'searchMemberUserIds'
  | 'assertAdministrativeAccess'
>;

type CalendarUserDirectory = Pick<AuthUserDirectoryService, 'findByIds'>;
type UserSummary = OrganizationUserSummary;

@Injectable()
export class CalendarService {
  constructor(
    private readonly calendarRepository: CalendarRepository,
    private readonly projectReferenceProvider: CalendarProjectReferenceProvider,
    @Inject(OrganizationsService)
    private readonly organizationsService: CalendarOrganizationsAccess,
    @Inject(AuthUserDirectoryService)
    private readonly userDirectory: CalendarUserDirectory,
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

    const usersById = await this.loadUsers(
      records.map((record) => record.meeting.organizerUserId),
    );
    const projectsById = await this.loadProjects(
      organizationId,
      records.flatMap((record) =>
        record.meeting.projectId ? [record.meeting.projectId] : [],
      ),
    );

    return MeetingListSchema.parse({
      items: records.map((record) =>
        this.toMeetingSummary(record, usersById, projectsById),
      ),
    });
  }

  async createMeeting(
    context: OrganizationActorContext,
    organizationId: string,
    input: CreateMeetingInput,
  ): Promise<MeetingDetailResponse> {
    await this.organizationsService.getDetail(context, organizationId);
    const startAt = new Date(input.startAt);
    const endAt = new Date(input.endAt);
    this.assertTimeRange(startAt, endAt);

    const attendeeUserIds = [...new Set(input.attendeeUserIds)];
    await this.assertParticipantsAreMembers(context, organizationId, [
      context.userId,
      ...attendeeUserIds,
    ]);

    const meetingRoomId = input.meetingRoomId ?? null;
    const locationText = input.locationText ?? null;
    this.assertLocation(input.locationType, meetingRoomId);
    if (input.locationType === 'meeting_room') {
      if (!meetingRoomId) throw new CalendarInvalidLocationError();
      await this.requireSelectableMeetingRoom(organizationId, meetingRoomId);
    }

    const projectId = input.projectId ?? null;
    if (projectId) {
      await this.projectReferenceProvider.assertReference(
        organizationId,
        projectId,
      );
    }

    const record = await this.calendarRepository.createMeetingWithAttendees({
      organizationId,
      projectId,
      organizerUserId: context.userId,
      title: input.title,
      category: input.category,
      startAt,
      endAt,
      timeZone: input.timeZone,
      locationType: input.locationType,
      meetingRoomId,
      locationText,
      agendaMarkdown: input.agendaMarkdown ?? '',
      notesMarkdown: input.notesMarkdown ?? '',
      reminderMinutes: input.reminderMinutes ?? null,
      attendeeUserIds,
    });
    return this.toMeetingDetail(organizationId, record);
  }

  async getMeeting(
    context: OrganizationActorContext,
    organizationId: string,
    meetingId: string,
  ): Promise<MeetingDetailResponse> {
    await this.organizationsService.getDetail(context, organizationId);
    return this.toMeetingDetail(
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
    if (current.meeting.organizerUserId !== context.userId) {
      await this.organizationsService.assertAdministrativeAccess(
        context,
        organizationId,
      );
    }

    const attendeeUserIds = input.attendeeUserIds
      ? [...new Set(input.attendeeUserIds)]
      : undefined;
    if (attendeeUserIds) {
      await this.assertParticipantsAreMembers(context, organizationId, [
        current.meeting.organizerUserId,
        ...attendeeUserIds,
      ]);
    }

    if (input.projectId !== undefined && input.projectId !== null) {
      await this.projectReferenceProvider.assertReference(
        organizationId,
        input.projectId,
      );
    }

    const locationType = input.locationType ?? current.meeting.locationType;
    let meetingRoomId =
      input.meetingRoomId === undefined
        ? current.meeting.meetingRoomId
        : input.meetingRoomId;
    if (
      input.locationType !== undefined &&
      input.locationType !== 'meeting_room' &&
      input.meetingRoomId === undefined
    ) {
      meetingRoomId = null;
    }
    this.assertLocation(locationType, meetingRoomId);

    const locationTouched =
      input.locationType !== undefined || input.meetingRoomId !== undefined;
    if (locationTouched && locationType === 'meeting_room') {
      if (!meetingRoomId) throw new CalendarInvalidLocationError();
      await this.requireSelectableMeetingRoom(organizationId, meetingRoomId);
    }

    const changes: Parameters<
      CalendarRepository['editMeetingDetails']
    >[0]['changes'] = {};
    if (input.title !== undefined) changes.title = input.title;
    if (input.category !== undefined) changes.category = input.category;
    if (input.projectId !== undefined) changes.projectId = input.projectId;
    if (input.locationType !== undefined)
      changes.locationType = input.locationType;
    if (
      input.meetingRoomId !== undefined ||
      meetingRoomId !== current.meeting.meetingRoomId
    ) {
      changes.meetingRoomId = meetingRoomId;
    }
    if (input.locationText !== undefined)
      changes.locationText = input.locationText;
    if (input.agendaMarkdown !== undefined) {
      changes.agendaMarkdown = input.agendaMarkdown;
    }
    if (input.notesMarkdown !== undefined) {
      changes.notesMarkdown = input.notesMarkdown;
    }
    if (input.reminderMinutes !== undefined) {
      changes.reminderMinutes = input.reminderMinutes;
    }

    const updated = await this.calendarRepository.editMeetingDetails({
      organizationId,
      meetingId,
      changes,
      attendeeUserIds,
    });
    if (!updated) throw new CalendarMeetingNotFoundError();
    return this.toMeetingDetail(organizationId, updated);
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
    if (input.description !== undefined)
      changes.description = input.description;
    if (input.active !== undefined) changes.active = input.active;

    const room = await this.calendarRepository.updateMeetingRoom({
      organizationId,
      meetingRoomId,
      changes,
    });
    if (!room) throw new CalendarMeetingRoomNotFoundError();
    return toMeetingRoomResponse(room);
  }

  private async requireMeeting(
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

  private async requireSelectableMeetingRoom(
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

  private async assertParticipantsAreMembers(
    context: OrganizationActorContext,
    organizationId: string,
    userIds: readonly string[],
  ): Promise<void> {
    const uniqueUserIds = [...new Set(userIds)];
    const members = await this.organizationsService.listMembersByUserIds(
      context,
      organizationId,
      uniqueUserIds,
    );
    const memberUserIds = new Set(members.map((member) => member.userId));
    if (uniqueUserIds.some((userId) => !memberUserIds.has(userId))) {
      throw new CalendarAttendeeNotMemberError();
    }
  }

  private assertTimeRange(startAt: Date, endAt: Date): void {
    if (endAt.getTime() <= startAt.getTime()) {
      throw new CalendarInvalidTimeRangeError();
    }
  }

  private assertLocation(
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

  private async toMeetingDetail(
    organizationId: string,
    record: CalendarMeetingDetailRecord,
  ): Promise<MeetingDetailResponse> {
    const usersById = await this.loadUsers([
      record.meeting.organizerUserId,
      ...record.attendees.map((attendee) => attendee.userId),
    ]);
    const projectsById = await this.loadProjects(
      organizationId,
      record.meeting.projectId ? [record.meeting.projectId] : [],
    );

    return MeetingDetailSchema.parse({
      ...this.toMeetingWire(record.meeting),
      organizer: this.requireUser(usersById, record.meeting.organizerUserId),
      attendees: record.attendees.map((attendee) => ({
        user: this.requireUser(usersById, attendee.userId),
        status: attendee.status,
      })),
      meetingRoom: record.meetingRoom,
      project: record.meeting.projectId
        ? (projectsById.get(record.meeting.projectId) ?? null)
        : null,
    });
  }

  private toMeetingSummary(
    record: CalendarMeetingListRecord,
    usersById: ReadonlyMap<string, UserSummary>,
    projectsById: ReadonlyMap<string, CalendarProjectSummary>,
  ): MeetingSummaryResponse {
    return {
      ...this.toMeetingWire(record.meeting),
      organizer: this.requireUser(usersById, record.meeting.organizerUserId),
      attendeeCount: record.attendeeCount,
      meetingRoom: record.meetingRoom,
      project: record.meeting.projectId
        ? (projectsById.get(record.meeting.projectId) ?? null)
        : null,
    };
  }

  private toMeetingWire(meeting: Meeting): MeetingWireResponse {
    return {
      ...meeting,
      startAt: meeting.startAt.toISOString(),
      endAt: meeting.endAt.toISOString(),
      createdAt: meeting.createdAt.toISOString(),
      updatedAt: meeting.updatedAt.toISOString(),
      canceledAt: meeting.canceledAt?.toISOString() ?? null,
    };
  }

  private async loadUsers(
    userIds: readonly string[],
  ): Promise<Map<string, UserSummary>> {
    const identities = await this.userDirectory.findByIds([
      ...new Set(userIds),
    ]);
    return new Map(
      identities.map((identity) => [identity.id, this.toUserSummary(identity)]),
    );
  }

  private toUserSummary(identity: AuthUserIdentity): UserSummary {
    return {
      id: identity.id,
      name: identity.name,
      email: identity.email,
      image: identity.image,
    };
  }

  private requireUser(
    usersById: ReadonlyMap<string, UserSummary>,
    userId: string,
  ): UserSummary {
    const user = usersById.get(userId);
    if (!user) {
      throw new Error(`회의 사용자 projection을 찾을 수 없습니다: ${userId}`);
    }
    return user;
  }

  private async loadProjects(
    organizationId: string,
    projectIds: readonly string[],
  ): Promise<Map<string, CalendarProjectSummary>> {
    const uniqueProjectIds = [...new Set(projectIds)];
    if (uniqueProjectIds.length === 0) {
      return new Map<string, CalendarProjectSummary>();
    }
    const summaries = await this.projectReferenceProvider.listSummaries(
      organizationId,
      uniqueProjectIds,
    );
    return new Map(summaries.map((project) => [project.id, project]));
  }
}
