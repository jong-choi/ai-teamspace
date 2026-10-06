import { Inject, Injectable } from '@nestjs/common';

import {
  AuthUserDirectoryService,
  type AuthUserIdentity,
} from '@/auth/auth-user-directory.service';
import { CalendarMeetingLoader } from '@/calendar/calendar-meeting.loader';
import { CalendarIcsGenerationError } from '@/calendar/domain/calendar.error';
import type { Meeting } from '@/calendar/domain/meeting';
import type { MeetingAttendee } from '@/calendar/domain/meeting-attendee';
import type { MeetingRecurrenceSeries } from '@/calendar/domain/meeting-recurrence-series';
import {
  type CalendarMeetingDetailRecord,
  CalendarMeetingQueryRepository,
} from '@/calendar/infrastructure/persistence/calendar-meeting-query.repository';
import type { OrganizationActorContext } from '@/organizations/organization-actor-context';
import { OrganizationsService } from '@/organizations/organizations.service';

import { TZDate } from '@date-fns/tz';
import { getVtimezoneComponent } from '@touch4it/ical-timezones';
import ical, {
  ICalAlarmType,
  type ICalAttendeeData,
  ICalAttendeeRole,
  ICalAttendeeStatus,
  ICalAttendeeType,
  ICalCalendarMethod,
  ICalEventBusyStatus,
  type ICalEventData,
  ICalEventRepeatingFreq,
  ICalEventStatus,
  ICalEventTransparency,
  type ICalRepeatingOptions,
  ICalWeekday,
} from 'ical-generator';

const attendeeStatusByRsvp: Record<
  MeetingAttendee['status'],
  ICalAttendeeStatus
> = {
  pending: ICalAttendeeStatus.NEEDSACTION,
  accepted: ICalAttendeeStatus.ACCEPTED,
  tentative: ICalAttendeeStatus.TENTATIVE,
  declined: ICalAttendeeStatus.DECLINED,
};

const recurrenceFrequencyByName = {
  daily: ICalEventRepeatingFreq.DAILY,
  weekly: ICalEventRepeatingFreq.WEEKLY,
  monthly: ICalEventRepeatingFreq.MONTHLY,
} as const;

const recurrenceWeekdayByName = {
  MO: ICalWeekday.MO,
  TU: ICalWeekday.TU,
  WE: ICalWeekday.WE,
  TH: ICalWeekday.TH,
  FR: ICalWeekday.FR,
  SA: ICalWeekday.SA,
  SU: ICalWeekday.SU,
} as const;

export type CalendarIcsDocument = {
  content: string;
  filename: string;
};

@Injectable()
export class CalendarIcsService {
  constructor(
    private readonly calendarRepository: CalendarMeetingQueryRepository,
    private readonly meetingLoader: CalendarMeetingLoader,
    @Inject(AuthUserDirectoryService)
    private readonly userDirectory: Pick<AuthUserDirectoryService, 'findByIds'>,
    @Inject(OrganizationsService)
    private readonly organizationsService: Pick<
      OrganizationsService,
      'getDetail'
    >,
  ) {}

  async exportMeeting(
    context: OrganizationActorContext,
    organizationId: Meeting['organizationId'],
    meetingId: Meeting['id'],
  ): Promise<CalendarIcsDocument> {
    await this.organizationsService.getDetail(context, organizationId);
    const selected = await this.meetingLoader.requireMeeting(
      organizationId,
      meetingId,
    );
    const records = selected.meeting.recurrenceSeriesId
      ? await this.calendarRepository.listMeetingsInSeries(
          organizationId,
          selected.meeting.recurrenceSeriesId,
        )
      : [selected];
    if (records.length === 0) throw new CalendarIcsGenerationError();

    const users = await this.loadUsers(records);
    const allCanceled = records.every(
      (record) => record.meeting.canceledAt !== null,
    );
    const calendar = ical({
      name: selected.meeting.title,
      prodId: {
        company: 'Work OS',
        product: 'Meeting Calendar',
        language: 'KO',
      },
      method: allCanceled
        ? ICalCalendarMethod.CANCEL
        : ICalCalendarMethod.PUBLISH,
      timezone: {
        name: null,
        generator: getVtimezoneComponent,
      },
    });

    for (const event of this.buildEvents(records, users)) {
      calendar.createEvent(event);
    }

    try {
      return {
        content: calendar.toString(),
        filename: `meeting-${selected.meeting.id}.ics`,
      };
    } catch (error) {
      throw new CalendarIcsGenerationError({ cause: error });
    }
  }

  private buildEvents(
    records: readonly CalendarMeetingDetailRecord[],
    users: ReadonlyMap<Meeting['organizerUserId'], AuthUserIdentity>,
  ): ICalEventData[] {
    const first = records[0];
    if (!first) throw new CalendarIcsGenerationError();

    if (!first.recurrence || !first.meeting.recurrenceSeriesId) {
      return [this.toEvent(first, users)];
    }

    const originalStart =
      first.meeting.recurrenceOriginalStartAt ?? first.meeting.startAt;
    const durationMs =
      first.meeting.endAt.getTime() - first.meeting.startAt.getTime();
    const maximumSequence = Math.max(
      ...records.map((record) => record.meeting.iCalSequence),
    );
    const allCanceled = records.every(
      (record) => record.meeting.canceledAt !== null,
    );
    const master = this.toEvent(first, users, {
      startAt: originalStart,
      endAt: new Date(originalStart.getTime() + durationMs),
      status: allCanceled
        ? ICalEventStatus.CANCELLED
        : ICalEventStatus.CONFIRMED,
      sequence: maximumSequence,
      repeating: this.toRepeating(first.recurrence),
    });
    if (allCanceled) return [master];

    const overrides = records.flatMap((record, index) => {
      const recurrenceId = record.meeting.recurrenceOriginalStartAt;
      if (!recurrenceId) return [];
      const unchangedFirst =
        index === 0 &&
        record.meeting.canceledAt === null &&
        record.meeting.startAt.getTime() === recurrenceId.getTime();
      if (unchangedFirst) return [];
      return [
        this.toEvent(record, users, {
          recurrenceId,
          serializeAsUtc: true,
        }),
      ];
    });
    return [master, ...overrides];
  }

  private toEvent(
    record: CalendarMeetingDetailRecord,
    users: ReadonlyMap<Meeting['organizerUserId'], AuthUserIdentity>,
    override: {
      startAt?: Date;
      endAt?: Date;
      recurrenceId?: Date;
      repeating?: ICalRepeatingOptions;
      status?: ICalEventStatus;
      sequence?: number;
      serializeAsUtc?: boolean;
    } = {},
  ): ICalEventData {
    const organizer = this.requireUser(users, record.meeting.organizerUserId);
    const status =
      override.status ??
      (record.meeting.canceledAt !== null
        ? ICalEventStatus.CANCELLED
        : ICalEventStatus.CONFIRMED);
    const canceled = status === ICalEventStatus.CANCELLED;
    const startAt = override.startAt ?? record.meeting.startAt;
    const endAt = override.endAt ?? record.meeting.endAt;

    return {
      id: record.meeting.iCalUid,
      sequence: override.sequence ?? record.meeting.iCalSequence,
      start: override.serializeAsUtc
        ? startAt
        : new TZDate(startAt, record.meeting.timeZone),
      end: override.serializeAsUtc
        ? endAt
        : new TZDate(endAt, record.meeting.timeZone),
      timezone: override.serializeAsUtc ? null : record.meeting.timeZone,
      recurrenceId: override.recurrenceId
        ? override.serializeAsUtc
          ? override.recurrenceId
          : new TZDate(override.recurrenceId, record.meeting.timeZone)
        : undefined,
      repeating: override.repeating,
      summary: record.meeting.title,
      description: record.meeting.agendaMarkdown || undefined,
      location: this.locationLabel(record),
      status,
      busystatus: canceled
        ? ICalEventBusyStatus.FREE
        : ICalEventBusyStatus.BUSY,
      transparency: canceled
        ? ICalEventTransparency.TRANSPARENT
        : ICalEventTransparency.OPAQUE,
      organizer: {
        name: organizer.name,
        email: organizer.email,
      },
      attendees: record.attendees.map((attendee) =>
        this.toAttendee(attendee, users),
      ),
      categories: [{ name: record.meeting.category }],
      alarms:
        !canceled && record.meeting.reminderMinutes !== null
          ? [
              {
                type: ICalAlarmType.display,
                description: record.meeting.title,
                triggerBefore: record.meeting.reminderMinutes * 60,
              },
            ]
          : undefined,
    };
  }

  private toRepeating(series: MeetingRecurrenceSeries): ICalRepeatingOptions {
    return {
      freq: recurrenceFrequencyByName[series.frequency],
      interval: series.interval,
      count: series.count ?? undefined,
      until: series.until
        ? new TZDate(series.until, series.timeZone)
        : undefined,
      byDay:
        series.byWeekday.length > 0
          ? series.byWeekday.map((weekday) => recurrenceWeekdayByName[weekday])
          : undefined,
    };
  }

  private toAttendee(
    attendee: MeetingAttendee,
    users: ReadonlyMap<Meeting['organizerUserId'], AuthUserIdentity>,
  ): ICalAttendeeData {
    const user = this.requireUser(users, attendee.userId);
    return {
      name: user.name,
      email: user.email,
      rsvp: attendee.status === 'pending',
      status: attendeeStatusByRsvp[attendee.status],
      role: ICalAttendeeRole.REQ,
      type: ICalAttendeeType.INDIVIDUAL,
    };
  }

  private locationLabel(
    record: CalendarMeetingDetailRecord,
  ): string | undefined {
    if (record.meetingRoom) return record.meetingRoom.name;
    if (record.meeting.locationText) return record.meeting.locationText;
    return record.meeting.locationType === 'online' ? 'Online' : undefined;
  }

  private async loadUsers(
    records: readonly CalendarMeetingDetailRecord[],
  ): Promise<Map<Meeting['organizerUserId'], AuthUserIdentity>> {
    const userIds = [
      ...new Set(
        records.flatMap((record) => [
          record.meeting.organizerUserId,
          ...record.attendees.map((attendee) => attendee.userId),
        ]),
      ),
    ];
    const identities = await this.userDirectory.findByIds(userIds);
    return new Map(identities.map((identity) => [identity.id, identity]));
  }

  private requireUser(
    users: ReadonlyMap<Meeting['organizerUserId'], AuthUserIdentity>,
    userId: Meeting['organizerUserId'],
  ): AuthUserIdentity {
    const user = users.get(userId);
    if (!user) {
      throw new CalendarIcsGenerationError({
        cause: new Error(`ICS 사용자 projection을 찾을 수 없습니다: ${userId}`),
      });
    }
    return user;
  }
}
