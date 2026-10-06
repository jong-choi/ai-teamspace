import { Inject, Injectable } from '@nestjs/common';

import { CalendarMeetingLoader } from '@/calendar/calendar-meeting.loader';
import { CalendarMeetingPolicy } from '@/calendar/calendar-meeting.policy';
import { CalendarMeetingPresenterService } from '@/calendar/calendar-meeting-presenter.service';
import { CalendarParticipantPolicy } from '@/calendar/calendar-participant.policy';
import { CalendarSchedulingConflictPolicy } from '@/calendar/calendar-scheduling-conflict.policy';
import {
  CalendarMeetingCanceledError,
  CalendarMeetingNotAttendeeError,
  CalendarMeetingNotFoundError,
} from '@/calendar/domain/calendar.error';
import type { MeetingDetailResponse } from '@/calendar/dto/meeting.dto';
import type { RsvpMeetingInput } from '@/calendar/dto/rsvp-meeting.dto';
import type { UpdateMeetingAttendeesInput } from '@/calendar/dto/update-meeting-attendees.dto';
import { CalendarRepository } from '@/calendar/infrastructure/persistence/calendar.repository';
import type { OrganizationActorContext } from '@/organizations/organization-actor-context';
import { OrganizationsService } from '@/organizations/organizations.service';

type CalendarOrganizationsAccess = Pick<OrganizationsService, 'getDetail'>;
type CalendarMeetingPresenter = Pick<
  CalendarMeetingPresenterService,
  'presentDetail'
>;

@Injectable()
export class CalendarParticipationService {
  constructor(
    private readonly calendarRepository: CalendarRepository,
    private readonly meetingLoader: CalendarMeetingLoader,
    private readonly meetingPolicy: CalendarMeetingPolicy,
    @Inject(CalendarMeetingPresenterService)
    private readonly presenter: CalendarMeetingPresenter,
    private readonly participantPolicy: CalendarParticipantPolicy,
    private readonly conflictPolicy: CalendarSchedulingConflictPolicy,
    @Inject(OrganizationsService)
    private readonly organizationsService: CalendarOrganizationsAccess,
  ) {}

  async replaceAttendees(
    context: OrganizationActorContext,
    organizationId: string,
    meetingId: string,
    input: UpdateMeetingAttendeesInput,
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

    const attendeeUserIds = this.participantPolicy.normalizeAttendeeUserIds(
      input.attendeeUserIds,
      current.meeting.organizerUserId,
    );
    await this.participantPolicy.assertMembers(context, organizationId, [
      current.meeting.organizerUserId,
      ...attendeeUserIds,
    ]);
    const existingIds = new Set(current.attendees.map((item) => item.userId));
    const attendeeSetUnchanged =
      existingIds.size === attendeeUserIds.length &&
      attendeeUserIds.every((userId) => existingIds.has(userId));
    if (attendeeSetUnchanged) {
      return this.presenter.presentDetail(organizationId, current);
    }

    const newlyAddedIds = attendeeUserIds.filter(
      (userId) => !existingIds.has(userId),
    );
    const result = await this.calendarRepository.replaceMeetingAttendees({
      organizationId,
      meetingId,
      attendeeUserIds,
      conflictUserIds: newlyAddedIds,
    });
    if (result.status === 'not_found') throw new CalendarMeetingNotFoundError();
    if (result.status === 'canceled') throw new CalendarMeetingCanceledError();
    if (result.status === 'conflict') {
      this.conflictPolicy.throwConflict(result);
    }
    return this.presenter.presentDetail(organizationId, result.record);
  }

  async updateRsvp(
    context: OrganizationActorContext,
    organizationId: string,
    meetingId: string,
    input: RsvpMeetingInput,
  ): Promise<MeetingDetailResponse> {
    await this.organizationsService.getDetail(context, organizationId);
    const current = await this.meetingLoader.requireMeeting(
      organizationId,
      meetingId,
    );
    this.meetingPolicy.assertActive(current);
    const result = await this.calendarRepository.updateAttendeeRsvp(
      organizationId,
      meetingId,
      context.userId,
      input.status,
    );
    if (result.status === 'not_found') throw new CalendarMeetingNotFoundError();
    if (result.status === 'canceled') throw new CalendarMeetingCanceledError();
    if (result.status === 'not_attendee') {
      throw new CalendarMeetingNotAttendeeError();
    }
    if (result.status === 'conflict') {
      this.conflictPolicy.throwConflict(result);
    }
    return this.presenter.presentDetail(
      organizationId,
      await this.meetingLoader.requireMeeting(organizationId, meetingId),
    );
  }
}
