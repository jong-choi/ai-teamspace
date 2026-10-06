import { Inject, Injectable } from '@nestjs/common';

import {
  CalendarInvalidLocationError,
  CalendarInvalidTimeRangeError,
  CalendarMeetingCanceledError,
} from '@/calendar/domain/calendar.error';
import type { Meeting } from '@/calendar/domain/meeting';
import type { CalendarMeetingDetailRecord } from '@/calendar/infrastructure/persistence/calendar-meeting-query.repository';
import type { OrganizationActorContext } from '@/organizations/organization-actor-context';
import { OrganizationsService } from '@/organizations/organizations.service';

type CalendarAdministrativeAccess = Pick<
  OrganizationsService,
  'assertAdministrativeAccess'
>;

@Injectable()
export class CalendarMeetingPolicy {
  constructor(
    @Inject(OrganizationsService)
    private readonly organizations: CalendarAdministrativeAccess,
  ) {}

  async assertModificationAccess(
    context: OrganizationActorContext,
    organizationId: Meeting['organizationId'],
    record: CalendarMeetingDetailRecord,
  ): Promise<void> {
    if (record.meeting.organizerUserId !== context.userId) {
      await this.organizations.assertAdministrativeAccess(
        context,
        organizationId,
      );
    }
  }

  assertActive(record: CalendarMeetingDetailRecord): void {
    if (record.meeting.canceledAt) {
      throw new CalendarMeetingCanceledError();
    }
  }

  assertTimeRange(startAt: Date, endAt: Date): void {
    if (endAt.getTime() <= startAt.getTime()) {
      throw new CalendarInvalidTimeRangeError();
    }
  }

  assertLocation(
    locationType: Meeting['locationType'],
    meetingRoomId: Meeting['meetingRoomId'],
  ): void {
    if (
      (locationType === 'meeting_room' && meetingRoomId === null) ||
      (locationType !== 'meeting_room' && meetingRoomId !== null)
    ) {
      throw new CalendarInvalidLocationError();
    }
  }
}
