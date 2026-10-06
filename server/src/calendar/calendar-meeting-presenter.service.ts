import { Inject, Injectable } from '@nestjs/common';

import {
  AuthUserDirectoryService,
  type AuthUserIdentity,
} from '#server/auth/auth-user-directory.service.js';
import type { CalendarProjectSummary } from '#server/calendar/domain/calendar-project-summary.js';
import type { Meeting } from '#server/calendar/domain/meeting.js';
import type { MeetingRecurrenceSeries } from '#server/calendar/domain/meeting-recurrence-series.js';
import {
  type MeetingDetailResponse,
  MeetingDetailSchema,
  type MeetingListResponse,
  MeetingListSchema,
  type MeetingSummaryResponse,
  type MeetingWireResponse,
} from '#server/calendar/dto/meeting.dto.js';
import type {
  CalendarMeetingDetailRecord,
  CalendarMeetingListRecord,
} from '#server/calendar/infrastructure/persistence/calendar.repository.js';
import { CalendarProjectReferenceProvider } from '#server/calendar/infrastructure/project/calendar-project-reference.provider.js';
import type { OrganizationUserSummary } from '#server/organizations/domain/organization-member.js';

@Injectable()
export class CalendarMeetingPresenterService {
  constructor(
    private readonly projectReferenceProvider: CalendarProjectReferenceProvider,
    @Inject(AuthUserDirectoryService)
    private readonly userDirectory: Pick<AuthUserDirectoryService, 'findByIds'>,
  ) {}

  async presentList(
    organizationId: string,
    records: readonly CalendarMeetingListRecord[],
  ): Promise<MeetingListResponse> {
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
        this.toSummary(record, usersById, projectsById),
      ),
    });
  }

  async presentDetail(
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
      ...this.toWire(record.meeting),
      organizer: this.requireUser(usersById, record.meeting.organizerUserId),
      attendees: record.attendees.map((attendee) => ({
        user: this.requireUser(usersById, attendee.userId),
        status: attendee.status,
      })),
      meetingRoom: record.meetingRoom,
      project: record.meeting.projectId
        ? (projectsById.get(record.meeting.projectId) ?? null)
        : null,
      recurrence: this.toRecurrence(record.recurrence),
    });
  }

  private toSummary(
    record: CalendarMeetingListRecord,
    usersById: ReadonlyMap<string, OrganizationUserSummary>,
    projectsById: ReadonlyMap<string, CalendarProjectSummary>,
  ): MeetingSummaryResponse {
    return {
      ...this.toWire(record.meeting),
      organizer: this.requireUser(usersById, record.meeting.organizerUserId),
      attendeeCount: record.attendeeCount,
      meetingRoom: record.meetingRoom,
      project: record.meeting.projectId
        ? (projectsById.get(record.meeting.projectId) ?? null)
        : null,
      recurrence: this.toRecurrence(record.recurrence),
    };
  }

  private toWire(meeting: Meeting): MeetingWireResponse {
    return {
      ...meeting,
      startAt: meeting.startAt.toISOString(),
      endAt: meeting.endAt.toISOString(),
      createdAt: meeting.createdAt.toISOString(),
      updatedAt: meeting.updatedAt.toISOString(),
      canceledAt: meeting.canceledAt?.toISOString() ?? null,
      recurrenceOriginalStartAt:
        meeting.recurrenceOriginalStartAt?.toISOString() ?? null,
    };
  }

  private toRecurrence(recurrence: MeetingRecurrenceSeries | null) {
    if (!recurrence) return null;
    return {
      id: recurrence.id,
      frequency: recurrence.frequency,
      interval: recurrence.interval,
      count: recurrence.count,
      until: recurrence.until?.toISOString() ?? null,
      byWeekday: recurrence.byWeekday,
      timeZone: recurrence.timeZone,
    };
  }

  private async loadUsers(
    userIds: readonly string[],
  ): Promise<Map<string, OrganizationUserSummary>> {
    const identities = await this.userDirectory.findByIds([
      ...new Set(userIds),
    ]);
    return new Map(
      identities.map((identity) => [identity.id, this.toUserSummary(identity)]),
    );
  }

  private toUserSummary(identity: AuthUserIdentity): OrganizationUserSummary {
    return {
      id: identity.id,
      name: identity.name,
      email: identity.email,
      image: identity.image,
    };
  }

  private requireUser(
    usersById: ReadonlyMap<string, OrganizationUserSummary>,
    userId: string,
  ): OrganizationUserSummary {
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
