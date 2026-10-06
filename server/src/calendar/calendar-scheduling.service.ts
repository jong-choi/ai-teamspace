import { randomUUID } from 'node:crypto';

import { Inject, Injectable, Logger } from '@nestjs/common';

import { CalendarMeetingLoader } from '@/calendar/calendar-meeting.loader';
import { CalendarMeetingPolicy } from '@/calendar/calendar-meeting.policy';
import { CalendarMeetingPresenterService } from '@/calendar/calendar-meeting-presenter.service';
import { CalendarParticipantPolicy } from '@/calendar/calendar-participant.policy';
import { CalendarRecurrenceService } from '@/calendar/calendar-recurrence.service';
import { CalendarSchedulingConflictPolicy } from '@/calendar/calendar-scheduling-conflict.policy';
import {
  CalendarMeetingAlreadyCanceledError,
  CalendarMeetingCanceledError,
  CalendarMeetingNotFoundError,
  CalendarMeetingRoomInactiveError,
} from '@/calendar/domain/calendar.error';
import type { Meeting } from '@/calendar/domain/meeting';
import type { CancelMeetingInput } from '@/calendar/dto/cancel-meeting.dto';
import type { CreateMeetingInput } from '@/calendar/dto/create-meeting.dto';
import type { MeetingDetailResponse } from '@/calendar/dto/meeting.dto';
import type { RescheduleMeetingInput } from '@/calendar/dto/reschedule-meeting.dto';
import type { CalendarMeetingDetailRecord } from '@/calendar/infrastructure/persistence/calendar-meeting-query.repository';
import { CalendarSchedulingRepository } from '@/calendar/infrastructure/persistence/calendar-scheduling.repository';
import { CalendarProjectReferenceProvider } from '@/calendar/infrastructure/project/calendar-project-reference.provider';
import { CalendarReminderScheduler } from '@/calendar/infrastructure/reminder/calendar-reminder-scheduler.provider';
import { RecurrenceSchedulingPlanService } from '@/calendar/recurrence-scheduling-plan.service';
import type { OrganizationActorContext } from '@/organizations/organization-actor-context';
import { OrganizationsService } from '@/organizations/organizations.service';

type CalendarOrganizationsAccess = Pick<OrganizationsService, 'getDetail'>;

type CalendarMeetingPresenter = Pick<
  CalendarMeetingPresenterService,
  'presentDetail'
>;

@Injectable()
export class CalendarSchedulingService {
  private readonly logger = new Logger(CalendarSchedulingService.name);

  constructor(
    private readonly schedulingRepository: CalendarSchedulingRepository,
    private readonly meetingLoader: CalendarMeetingLoader,
    private readonly meetingPolicy: CalendarMeetingPolicy,
    @Inject(CalendarMeetingPresenterService)
    private readonly presenter: CalendarMeetingPresenter,
    private readonly recurrenceService: CalendarRecurrenceService,
    private readonly recurrencePlanService: RecurrenceSchedulingPlanService,
    private readonly participantPolicy: CalendarParticipantPolicy,
    private readonly conflictPolicy: CalendarSchedulingConflictPolicy,
    private readonly projectReferenceProvider: CalendarProjectReferenceProvider,
    private readonly reminderScheduler: CalendarReminderScheduler,
    @Inject(OrganizationsService)
    private readonly organizationsService: CalendarOrganizationsAccess,
  ) {}

  async createMeeting(
    context: OrganizationActorContext,
    organizationId: Meeting['organizationId'],
    input: CreateMeetingInput,
  ): Promise<MeetingDetailResponse> {
    await this.organizationsService.getDetail(context, organizationId);
    const startAt = new Date(input.startAt);
    const endAt = new Date(input.endAt);
    this.meetingPolicy.assertTimeRange(startAt, endAt);

    const attendeeUserIds = this.participantPolicy.normalizeAttendeeUserIds(
      input.attendeeUserIds,
      context.userId,
    );
    await this.participantPolicy.assertMembers(context, organizationId, [
      context.userId,
      ...attendeeUserIds,
    ]);

    const meetingRoomId = input.meetingRoomId ?? null;
    this.meetingPolicy.assertLocation(input.locationType, meetingRoomId);
    if (meetingRoomId) {
      await this.meetingLoader.requireSelectableMeetingRoom(
        organizationId,
        meetingRoomId,
      );
    }

    const projectId = input.projectId ?? null;
    if (projectId) {
      await this.projectReferenceProvider.assertReference(
        organizationId,
        projectId,
      );
    }

    const occurrences = input.recurrence
      ? this.recurrenceService.materialize({
          startAt,
          endAt,
          rule: input.recurrence,
        })
      : [
          {
            startAt,
            endAt,
            originalStartAt: startAt,
          },
        ];
    const result = await this.schedulingRepository.scheduleMeeting(
      organizationId,
      context.userId,
      {
        ...input,
        projectId,
        meetingRoomId,
        locationText: input.locationText ?? null,
        agendaMarkdown: input.agendaMarkdown ?? '',
        notesMarkdown: input.notesMarkdown ?? '',
        reminderMinutes: input.reminderMinutes ?? null,
      },
      attendeeUserIds,
      occurrences.map((occurrence) => ({
        startAt: occurrence.startAt,
        endAt: occurrence.endAt,
        recurrenceOriginalStartAt: input.recurrence
          ? occurrence.originalStartAt
          : null,
      })),
      input.recurrence
        ? {
            frequency: input.recurrence.frequency,
            interval: input.recurrence.interval,
            count: input.recurrence.count ?? null,
            until: input.recurrence.until
              ? new Date(input.recurrence.until)
              : null,
            byWeekday: input.recurrence.byWeekday,
            timeZone: input.recurrence.timeZone,
          }
        : null,
      randomUUID(),
    );
    if (result.status === 'room_unavailable') {
      throw new CalendarMeetingRoomInactiveError();
    }
    if (result.status === 'conflict') {
      this.conflictPolicy.throwConflict(result);
    }
    await this.syncReminders(result.records);
    const first = result.records[0];
    if (!first) throw new CalendarMeetingNotFoundError();
    return this.presenter.presentDetail(organizationId, first);
  }

  async rescheduleMeeting(
    context: OrganizationActorContext,
    organizationId: Meeting['organizationId'],
    meetingId: Meeting['id'],
    input: RescheduleMeetingInput,
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

    const startAt = new Date(input.startAt);
    const endAt = new Date(input.endAt);
    this.meetingPolicy.assertTimeRange(startAt, endAt);
    const meetingRoomId = input.meetingRoomId;
    this.meetingPolicy.assertLocation(input.locationType, meetingRoomId);
    if (meetingRoomId) {
      await this.meetingLoader.requireSelectableMeetingRoom(
        organizationId,
        meetingRoomId,
      );
    }
    const plan = await this.recurrencePlanService.buildReschedulePlan({
      organizationId,
      current,
      input,
      startAt,
      endAt,
    });
    const result = await this.schedulingRepository.rescheduleMeetings(...plan);
    if (result.status === 'not_found') throw new CalendarMeetingNotFoundError();
    if (result.status === 'canceled') throw new CalendarMeetingCanceledError();
    if (result.status === 'room_unavailable') {
      throw new CalendarMeetingRoomInactiveError();
    }
    if (result.status === 'conflict') {
      this.conflictPolicy.throwConflict(result);
    }
    await this.syncReminders(result.records);
    const selected = result.records.find(
      (record) => record.meeting.id === meetingId,
    );
    if (!selected) throw new CalendarMeetingNotFoundError();
    return this.presenter.presentDetail(organizationId, selected);
  }

  async cancelMeeting(
    context: OrganizationActorContext,
    organizationId: Meeting['organizationId'],
    meetingId: Meeting['id'],
    input: CancelMeetingInput,
  ): Promise<MeetingDetailResponse> {
    await this.organizationsService.getDetail(context, organizationId);
    const current = await this.meetingLoader.requireMeeting(
      organizationId,
      meetingId,
    );
    if (current.meeting.canceledAt) {
      throw new CalendarMeetingAlreadyCanceledError();
    }
    await this.meetingPolicy.assertModificationAccess(
      context,
      organizationId,
      current,
    );

    const targets = await this.recurrencePlanService.resolveScopedMeetings(
      organizationId,
      current,
      input.scope,
    );
    const records = await this.schedulingRepository.cancelMeetings(
      organizationId,
      targets.map((record) => record.meeting.id),
      context.userId,
      input,
    );
    await this.cancelReminders(targets.map((record) => record.meeting.id));
    const selected = records.find((record) => record.meeting.id === meetingId);
    if (!selected) throw new CalendarMeetingNotFoundError();
    return this.presenter.presentDetail(organizationId, selected);
  }

  private async syncReminders(
    records: readonly CalendarMeetingDetailRecord[],
  ): Promise<void> {
    try {
      await this.reminderScheduler.sync(
        records.map((record) => record.meeting),
      );
    } catch (error) {
      this.logger.error(
        'Meeting은 저장되었지만 reminder queue 동기화에 실패했습니다.',
        error,
      );
    }
  }

  private async cancelReminders(
    meetingIds: readonly Meeting['id'][],
  ): Promise<void> {
    try {
      await this.reminderScheduler.cancel(meetingIds);
    } catch (error) {
      this.logger.error(
        'Meeting은 취소되었지만 reminder queue 정리에 실패했습니다.',
        error,
      );
    }
  }
}
