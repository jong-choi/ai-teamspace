import { randomUUID } from 'node:crypto';

import { Inject, Injectable, Logger } from '@nestjs/common';

import { CalendarMeetingLoader } from '#server/calendar/calendar-meeting.loader.js';
import { CalendarMeetingPolicy } from '#server/calendar/calendar-meeting.policy.js';
import { CalendarMeetingPresenterService } from '#server/calendar/calendar-meeting-presenter.service.js';
import { CalendarRecurrenceService } from '#server/calendar/calendar-recurrence.service.js';
import {
  CalendarAttendeeNotMemberError,
  CalendarInvalidRecurrenceScopeError,
  CalendarMeetingAlreadyCanceledError,
  CalendarMeetingCanceledError,
  CalendarMeetingNotAttendeeError,
  CalendarMeetingNotFoundError,
  CalendarMeetingRoomInactiveError,
  CalendarParticipantConflictError,
  CalendarRoomConflictError,
} from '#server/calendar/domain/calendar.error.js';
import type { MeetingRecurrenceSeries } from '#server/calendar/domain/meeting-recurrence-series.js';
import type {
  CalendarAvailabilityRequest,
  CalendarAvailabilityResponse,
  CalendarRescheduleAvailabilityRequest,
} from '#server/calendar/dto/calendar-availability.dto.js';
import { CalendarAvailabilityResponseSchema } from '#server/calendar/dto/calendar-availability.dto.js';
import type { CancelMeetingInput } from '#server/calendar/dto/cancel-meeting.dto.js';
import type { CreateMeetingInput } from '#server/calendar/dto/create-meeting.dto.js';
import type { MeetingDetailResponse } from '#server/calendar/dto/meeting.dto.js';
import type { RescheduleMeetingInput } from '#server/calendar/dto/reschedule-meeting.dto.js';
import type { RsvpMeetingInput } from '#server/calendar/dto/rsvp-meeting.dto.js';
import type { UpdateMeetingAttendeesInput } from '#server/calendar/dto/update-meeting-attendees.dto.js';
import {
  type CalendarMeetingDetailRecord,
  CalendarRepository,
  type CalendarSchedulingConflict,
  type RescheduleMeetingUpdate,
} from '#server/calendar/infrastructure/persistence/calendar.repository.js';
import { CalendarProjectReferenceProvider } from '#server/calendar/infrastructure/project/calendar-project-reference.provider.js';
import { CalendarReminderScheduler } from '#server/calendar/infrastructure/reminder/calendar-reminder-scheduler.provider.js';
import type { OrganizationActorContext } from '#server/organizations/organization-actor-context.js';
import { OrganizationsService } from '#server/organizations/organizations.service.js';

type CalendarOrganizationsAccess = Pick<
  OrganizationsService,
  'getDetail' | 'listMembersByUserIds'
>;

type CalendarMeetingPresenter = Pick<
  CalendarMeetingPresenterService,
  'presentDetail'
>;

@Injectable()
export class CalendarSchedulingService {
  private readonly logger = new Logger(CalendarSchedulingService.name);

  constructor(
    private readonly calendarRepository: CalendarRepository,
    private readonly meetingLoader: CalendarMeetingLoader,
    private readonly meetingPolicy: CalendarMeetingPolicy,
    @Inject(CalendarMeetingPresenterService)
    private readonly presenter: CalendarMeetingPresenter,
    private readonly recurrenceService: CalendarRecurrenceService,
    private readonly projectReferenceProvider: CalendarProjectReferenceProvider,
    private readonly reminderScheduler: CalendarReminderScheduler,
    @Inject(OrganizationsService)
    private readonly organizationsService: CalendarOrganizationsAccess,
  ) {}

  async previewAvailability(
    context: OrganizationActorContext,
    organizationId: string,
    input: CalendarAvailabilityRequest,
  ): Promise<CalendarAvailabilityResponse> {
    await this.organizationsService.getDetail(context, organizationId);
    const attendeeUserIds = this.normalizeAttendeeUserIds(
      input.attendeeUserIds,
      context.userId,
    );
    await this.assertParticipantsAreMembers(context, organizationId, [
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

  async createMeeting(
    context: OrganizationActorContext,
    organizationId: string,
    input: CreateMeetingInput,
  ): Promise<MeetingDetailResponse> {
    await this.organizationsService.getDetail(context, organizationId);
    const startAt = new Date(input.startAt);
    const endAt = new Date(input.endAt);
    this.meetingPolicy.assertTimeRange(startAt, endAt);

    const attendeeUserIds = this.normalizeAttendeeUserIds(
      input.attendeeUserIds,
      context.userId,
    );
    await this.assertParticipantsAreMembers(context, organizationId, [
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
    const result = await this.calendarRepository.scheduleMeeting({
      template: {
        organizationId,
        projectId,
        organizerUserId: context.userId,
        title: input.title,
        category: input.category,
        timeZone: input.timeZone,
        locationType: input.locationType,
        meetingRoomId,
        locationText: input.locationText ?? null,
        agendaMarkdown: input.agendaMarkdown ?? '',
        notesMarkdown: input.notesMarkdown ?? '',
        reminderMinutes: input.reminderMinutes ?? null,
        iCalUid: randomUUID(),
      },
      attendeeUserIds,
      occurrences: occurrences.map((occurrence) => ({
        startAt: occurrence.startAt,
        endAt: occurrence.endAt,
        recurrenceOriginalStartAt: input.recurrence
          ? occurrence.originalStartAt
          : null,
      })),
      recurrence: input.recurrence
        ? {
            organizationId,
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
    });
    if (result.status === 'room_unavailable') {
      throw new CalendarMeetingRoomInactiveError();
    }
    if (result.status === 'conflict') this.throwConflict(result);
    await this.syncReminders(result.records);
    const first = result.records[0];
    if (!first) throw new CalendarMeetingNotFoundError();
    return this.presenter.presentDetail(organizationId, first);
  }

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

    const attendeeUserIds = this.normalizeAttendeeUserIds(
      input.attendeeUserIds,
      current.meeting.organizerUserId,
    );
    await this.assertParticipantsAreMembers(context, organizationId, [
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
    if (result.status === 'conflict') this.throwConflict(result);
    return this.presenter.presentDetail(organizationId, result.record);
  }

  async rescheduleMeeting(
    context: OrganizationActorContext,
    organizationId: string,
    meetingId: string,
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
    const locationText = input.locationText;

    const plan = await this.buildReschedulePlan({
      organizationId,
      current,
      input,
      startAt,
      endAt,
      meetingRoomId,
      locationText,
    });
    const result = await this.calendarRepository.rescheduleMeetings(plan);
    if (result.status === 'not_found') throw new CalendarMeetingNotFoundError();
    if (result.status === 'canceled') throw new CalendarMeetingCanceledError();
    if (result.status === 'room_unavailable') {
      throw new CalendarMeetingRoomInactiveError();
    }
    if (result.status === 'conflict') this.throwConflict(result);
    await this.syncReminders(result.records);
    const selected = result.records.find(
      (record) => record.meeting.id === meetingId,
    );
    if (!selected) throw new CalendarMeetingNotFoundError();
    return this.presenter.presentDetail(organizationId, selected);
  }

  async cancelMeeting(
    context: OrganizationActorContext,
    organizationId: string,
    meetingId: string,
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

    const targets = await this.resolveScopedMeetings(
      organizationId,
      current,
      input.scope,
    );
    const records = await this.calendarRepository.cancelMeetings({
      organizationId,
      meetingIds: targets.map((record) => record.meeting.id),
      canceledByUserId: context.userId,
      cancelReason: input.reason,
    });
    await this.cancelReminders(targets.map((record) => record.meeting.id));
    const selected = records.find((record) => record.meeting.id === meetingId);
    if (!selected) throw new CalendarMeetingNotFoundError();
    return this.presenter.presentDetail(organizationId, selected);
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
    if (result.status === 'conflict') this.throwConflict(result);
    return this.presenter.presentDetail(
      organizationId,
      await this.meetingLoader.requireMeeting(organizationId, meetingId),
    );
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

  private async buildReschedulePlan(input: {
    organizationId: string;
    current: CalendarMeetingDetailRecord;
    input: RescheduleMeetingInput;
    startAt: Date;
    endAt: Date;
    meetingRoomId: string | null;
    locationText: string | null;
  }): Promise<Parameters<CalendarRepository['rescheduleMeetings']>[0]> {
    if (input.input.scope === 'single') {
      return {
        organizationId: input.organizationId,
        updates: [
          this.toRescheduleUpdate(
            input.current,
            input.startAt,
            input.endAt,
            input.input,
            input.meetingRoomId,
            input.locationText,
          ),
        ],
      };
    }

    const recurrence = input.current.recurrence;
    const recurrenceSeriesId = input.current.meeting.recurrenceSeriesId;
    const selectedOriginal = input.current.meeting.recurrenceOriginalStartAt;
    if (!recurrence || !recurrenceSeriesId || !selectedOriginal) {
      throw new CalendarInvalidRecurrenceScopeError();
    }
    const series = await this.calendarRepository.listMeetingsInSeries(
      input.organizationId,
      recurrenceSeriesId,
    );
    const targets =
      input.input.scope === 'series'
        ? series
        : series.filter(
            (record) =>
              record.meeting.recurrenceOriginalStartAt !== null &&
              record.meeting.recurrenceOriginalStartAt >= selectedOriginal,
          );
    if (targets.length === 0) throw new CalendarInvalidRecurrenceScopeError();

    const shifted = this.recurrenceService.shiftOccurrences({
      occurrences: targets.map((record) => ({
        startAt: record.meeting.startAt,
      })),
      selectedStartAt: input.current.meeting.startAt,
      selectedTimeZone: input.current.meeting.timeZone,
      requestedStartAt: input.startAt,
      requestedEndAt: input.endAt,
      requestedTimeZone: input.input.timeZone,
    });
    const allowedCanceledMeetingIds = targets
      .filter((record) => record.meeting.canceledAt !== null)
      .map((record) => record.meeting.id);
    const sourceRecords =
      input.input.scope === 'future'
        ? series.filter(
            (record) =>
              record.meeting.recurrenceOriginalStartAt !== null &&
              record.meeting.recurrenceOriginalStartAt < selectedOriginal,
          )
        : [];
    const futureAffectsWholeSeries =
      input.input.scope === 'future' && sourceRecords.length === 0;
    const shouldSplitFuture =
      input.input.scope === 'future' &&
      sourceRecords.length > 0 &&
      targets.length >= 2;
    const shouldRewriteRecurrenceIdentity =
      input.input.scope === 'series' ||
      futureAffectsWholeSeries ||
      shouldSplitFuture;

    const updates: RescheduleMeetingUpdate[] = targets.map((record, index) => {
      const next = shifted[index];
      if (!next) throw new CalendarInvalidRecurrenceScopeError();
      return {
        meetingId: record.meeting.id,
        startAt: next.startAt,
        endAt: next.endAt,
        timeZone: input.input.timeZone,
        locationType: input.input.locationType,
        meetingRoomId: input.meetingRoomId,
        locationText: input.locationText,
        recurrenceOriginalStartAt: shouldRewriteRecurrenceIdentity
          ? next.originalStartAt
          : undefined,
      };
    });

    if (
      input.input.scope === 'future' &&
      !futureAffectsWholeSeries &&
      !shouldSplitFuture
    ) {
      return {
        organizationId: input.organizationId,
        updates,
        allowedCanceledMeetingIds,
      };
    }

    const dayShift = this.recurrenceService.calendarDayShift({
      from: input.current.meeting.startAt,
      fromTimeZone: input.current.meeting.timeZone,
      to: input.startAt,
      toTimeZone: input.input.timeZone,
    });
    const shiftedWeekdays = this.recurrenceService.shiftWeekdays(
      recurrence.byWeekday,
      dayShift,
    );
    const shiftedStarts = shifted.map(
      (occurrence) => occurrence.originalStartAt,
    );

    if (input.input.scope === 'series' || futureAffectsWholeSeries) {
      return {
        organizationId: input.organizationId,
        updates,
        allowedCanceledMeetingIds,
        recurrenceMutation: {
          kind: 'update',
          seriesId: recurrence.id,
          changes: {
            ...this.recurrenceTermination(recurrence, shiftedStarts),
            byWeekday: shiftedWeekdays,
            timeZone: input.input.timeZone,
          },
        },
      };
    }

    const sourceStarts = sourceRecords.map((record) => {
      const originalStartAt = record.meeting.recurrenceOriginalStartAt;
      if (!originalStartAt) throw new CalendarInvalidRecurrenceScopeError();
      return originalStartAt;
    });
    return {
      organizationId: input.organizationId,
      updates,
      allowedCanceledMeetingIds,
      recurrenceMutation: {
        kind: 'split',
        sourceSeriesId: recurrence.id,
        sourceChanges: this.recurrenceTermination(recurrence, sourceStarts),
        meetingIds: targets.map((record) => record.meeting.id),
        create: {
          organizationId: input.organizationId,
          frequency: recurrence.frequency,
          interval: recurrence.interval,
          ...this.recurrenceTermination(recurrence, shiftedStarts),
          byWeekday: shiftedWeekdays,
          timeZone: input.input.timeZone,
        },
      },
    };
  }

  private toRescheduleUpdate(
    record: CalendarMeetingDetailRecord,
    startAt: Date,
    endAt: Date,
    input: RescheduleMeetingInput,
    meetingRoomId: string | null,
    locationText: string | null,
  ): RescheduleMeetingUpdate {
    return {
      meetingId: record.meeting.id,
      startAt,
      endAt,
      timeZone: input.timeZone,
      locationType: input.locationType,
      meetingRoomId,
      locationText,
    };
  }

  private recurrenceTermination(
    recurrence: MeetingRecurrenceSeries,
    occurrenceStarts: readonly Date[],
  ): Pick<MeetingRecurrenceSeries, 'count' | 'until'> {
    const lastStart = occurrenceStarts.at(-1);
    if (!lastStart) throw new CalendarInvalidRecurrenceScopeError();

    if (recurrence.count !== null && occurrenceStarts.length >= 2) {
      return { count: occurrenceStarts.length, until: null };
    }
    return { count: null, until: new Date(lastStart) };
  }

  private async resolveScopedMeetings(
    organizationId: string,
    current: CalendarMeetingDetailRecord,
    scope: CancelMeetingInput['scope'],
  ): Promise<CalendarMeetingDetailRecord[]> {
    if (scope === 'single') return [current];
    const recurrenceSeriesId = current.meeting.recurrenceSeriesId;
    const recurrenceOriginalStartAt = current.meeting.recurrenceOriginalStartAt;
    if (!recurrenceSeriesId || !recurrenceOriginalStartAt) {
      throw new CalendarInvalidRecurrenceScopeError();
    }
    const series = await this.calendarRepository.listMeetingsInSeries(
      organizationId,
      recurrenceSeriesId,
    );
    if (scope === 'series') return series;
    return series.filter(
      (record) =>
        record.meeting.recurrenceOriginalStartAt !== null &&
        record.meeting.recurrenceOriginalStartAt >= recurrenceOriginalStartAt,
    );
  }

  private normalizeAttendeeUserIds(
    attendeeUserIds: readonly string[],
    organizerUserId: string,
  ): string[] {
    return [...new Set(attendeeUserIds)].filter(
      (userId) => userId !== organizerUserId,
    );
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

  private throwConflict(conflict: CalendarSchedulingConflict): never {
    if (conflict.participantConflicts.length > 0) {
      throw new CalendarParticipantConflictError();
    }
    if (conflict.roomConflict) throw new CalendarRoomConflictError();
    throw new CalendarParticipantConflictError();
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

  private async cancelReminders(meetingIds: readonly string[]): Promise<void> {
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
