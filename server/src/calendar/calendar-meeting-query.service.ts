import { Inject, Injectable } from '@nestjs/common';

import { CalendarMeetingLoader } from '@/calendar/calendar-meeting.loader';
import { CalendarMeetingPolicy } from '@/calendar/calendar-meeting.policy';
import { CalendarMeetingPresenterService } from '@/calendar/calendar-meeting-presenter.service';
import type { Meeting } from '@/calendar/domain/meeting';
import type {
  MeetingDetailResponse,
  MeetingListResponse,
} from '@/calendar/dto/meeting.dto';
import type { QueryCalendarMeetingsInput } from '@/calendar/dto/query-calendar-meetings.dto';
import { CalendarMeetingQueryRepository } from '@/calendar/infrastructure/persistence/calendar-meeting-query.repository';
import type { OrganizationActorContext } from '@/organizations/organization-actor-context';
import { OrganizationsService } from '@/organizations/organizations.service';

type CalendarOrganizationsAccess = Pick<
  OrganizationsService,
  'getDetail' | 'searchMemberUserIds'
>;

type CalendarMeetingPresenter = Pick<
  CalendarMeetingPresenterService,
  'presentList' | 'presentDetail'
>;

@Injectable()
export class CalendarMeetingQueryService {
  constructor(
    private readonly calendarRepository: CalendarMeetingQueryRepository,
    private readonly meetingLoader: CalendarMeetingLoader,
    private readonly meetingPolicy: CalendarMeetingPolicy,
    @Inject(CalendarMeetingPresenterService)
    private readonly presenter: CalendarMeetingPresenter,
    @Inject(OrganizationsService)
    private readonly organizationsService: CalendarOrganizationsAccess,
  ) {}

  async listMeetings(
    context: OrganizationActorContext,
    organizationId: Meeting['organizationId'],
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
    organizationId: Meeting['organizationId'],
    meetingId: Meeting['id'],
  ): Promise<MeetingDetailResponse> {
    await this.organizationsService.getDetail(context, organizationId);
    return this.presenter.presentDetail(
      organizationId,
      await this.meetingLoader.requireMeeting(organizationId, meetingId),
    );
  }
}
