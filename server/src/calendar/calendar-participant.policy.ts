import { Inject, Injectable } from '@nestjs/common';

import { CalendarAttendeeNotMemberError } from '@/calendar/domain/calendar.error';
import type { OrganizationActorContext } from '@/organizations/organization-actor-context';
import { OrganizationsService } from '@/organizations/organizations.service';

type CalendarParticipantDirectory = Pick<
  OrganizationsService,
  'listMembersByUserIds'
>;

@Injectable()
export class CalendarParticipantPolicy {
  constructor(
    @Inject(OrganizationsService)
    private readonly organizationsService: CalendarParticipantDirectory,
  ) {}

  normalizeAttendeeUserIds(
    attendeeUserIds: readonly string[],
    organizerUserId: string,
  ): string[] {
    return [...new Set(attendeeUserIds)].filter(
      (userId) => userId !== organizerUserId,
    );
  }

  async assertMembers(
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
}
