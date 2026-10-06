import { Inject, Injectable } from '@nestjs/common';

import {
  CalendarInvalidLocationError,
  CalendarInvalidTimeRangeError,
  CalendarMeetingCanceledError,
} from '#server/calendar/domain/calendar.error.js';
import type { Meeting } from '#server/calendar/domain/meeting.js';
import type { CalendarMeetingDetailRecord } from '#server/calendar/infrastructure/persistence/calendar.repository.js';
import type { OrganizationActorContext } from '#server/organizations/organization-actor-context.js';
import { OrganizationsService } from '#server/organizations/organizations.service.js';

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
    organizationId: string,
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
    meetingRoomId: string | null,
  ): void {
    if (
      (locationType === 'meeting_room' && meetingRoomId === null) ||
      (locationType !== 'meeting_room' && meetingRoomId !== null)
    ) {
      throw new CalendarInvalidLocationError();
    }
  }
}
