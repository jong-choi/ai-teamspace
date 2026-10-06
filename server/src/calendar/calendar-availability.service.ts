import { Inject, Injectable } from '@nestjs/common';

import { CalendarMeetingLoader } from '@/calendar/calendar-meeting.loader';
import { CalendarMeetingPolicy } from '@/calendar/calendar-meeting.policy';
import { CalendarParticipantPolicy } from '@/calendar/calendar-participant.policy';
import {
  type CalendarAvailabilityRequest,
  type CalendarAvailabilityResponse,
  CalendarAvailabilityResponseSchema,
  type CalendarRescheduleAvailabilityRequest,
} from '@/calendar/dto/calendar-availability.dto';
import { CalendarRepository } from '@/calendar/infrastructure/persistence/calendar.repository';
import type { OrganizationActorContext } from '@/organizations/organization-actor-context';
import { OrganizationsService } from '@/organizations/organizations.service';

type CalendarOrganizationsAccess = Pick<OrganizationsService, 'getDetail'>;

@Injectable()
export class CalendarAvailabilityService {
  constructor(
    private readonly calendarRepository: CalendarRepository,
    private readonly meetingLoader: CalendarMeetingLoader,
    private readonly meetingPolicy: CalendarMeetingPolicy,
    private readonly participantPolicy: CalendarParticipantPolicy,
    @Inject(OrganizationsService)
    private readonly organizationsService: CalendarOrganizationsAccess,
  ) {}

  async previewAvailability(
    context: OrganizationActorContext,
    organizationId: string,
    input: CalendarAvailabilityRequest,
  ): Promise<CalendarAvailabilityResponse> {
    await this.organizationsService.getDetail(context, organizationId);
    const attendeeUserIds = this.participantPolicy.normalizeAttendeeUserIds(
      input.attendeeUserIds,
      context.userId,
    );
    await this.participantPolicy.assertMembers(context, organizationId, [
      context.userId,
      ...attendeeUserIds,
    ]);
    if (input.meetingRoomId) {
      await this.meetingLoader.requireSelectableMeetingRoom(
        organizationId,
        input.meetingRoomId,
      );
    }
    return this.buildAvailability({
      organizationId,
      participantUserIds: [context.userId, ...attendeeUserIds],
      meetingRoomId: input.meetingRoomId,
      startAt: new Date(input.startAt),
      endAt: new Date(input.endAt),
    });
  }

  async previewRescheduleAvailability(
    context: OrganizationActorContext,
    organizationId: string,
    meetingId: string,
    input: CalendarRescheduleAvailabilityRequest,
  ): Promise<CalendarAvailabilityResponse> {
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
    const attendeeUserIds = current.attendees
      .filter((attendee) => attendee.status !== 'declined')
      .map((attendee) => attendee.userId);
    if (input.meetingRoomId) {
      await this.meetingLoader.requireSelectableMeetingRoom(
        organizationId,
        input.meetingRoomId,
      );
    }
    return this.buildAvailability({
      organizationId,
      participantUserIds: [current.meeting.organizerUserId, ...attendeeUserIds],
      meetingRoomId: input.meetingRoomId,
      startAt: new Date(input.startAt),
      endAt: new Date(input.endAt),
      excludeMeetingIds: [meetingId],
    });
  }

  private async buildAvailability(input: {
    organizationId: string;
    participantUserIds: readonly string[];
    meetingRoomId: string | null;
    startAt: Date;
    endAt: Date;
    excludeMeetingIds?: readonly string[];
  }): Promise<CalendarAvailabilityResponse> {
    this.meetingPolicy.assertTimeRange(input.startAt, input.endAt);
    const participantConflicts =
      await this.calendarRepository.findParticipantBusyIntervals({
        organizationId: input.organizationId,
        userIds: input.participantUserIds,
        startAt: input.startAt,
        endAt: input.endAt,
        excludeMeetingIds: input.excludeMeetingIds,
      });
    const roomConflicts = input.meetingRoomId
      ? await this.calendarRepository.findRoomBusyIntervals({
          organizationId: input.organizationId,
          meetingRoomId: input.meetingRoomId,
          startAt: input.startAt,
          endAt: input.endAt,
          excludeMeetingIds: input.excludeMeetingIds,
        })
      : [];
    return CalendarAvailabilityResponseSchema.parse({
      available:
        participantConflicts.length === 0 && roomConflicts.length === 0,
      participantConflicts: participantConflicts.map((conflict) => ({
        userId: conflict.userId,
        startAt: conflict.startAt.toISOString(),
        endAt: conflict.endAt.toISOString(),
        sourceType: conflict.sourceType,
      })),
      roomConflict: roomConflicts[0]
        ? {
            meetingRoomId: roomConflicts[0].meetingRoomId,
            startAt: roomConflicts[0].startAt.toISOString(),
            endAt: roomConflicts[0].endAt.toISOString(),
          }
        : null,
    });
  }
}
