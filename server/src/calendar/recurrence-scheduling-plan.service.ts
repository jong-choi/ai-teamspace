import { Injectable } from '@nestjs/common';

import { CalendarRecurrenceService } from '@/calendar/calendar-recurrence.service';
import { CalendarInvalidRecurrenceScopeError } from '@/calendar/domain/calendar.error';
import type { Meeting } from '@/calendar/domain/meeting';
import type { MeetingRecurrenceSeries } from '@/calendar/domain/meeting-recurrence-series';
import type { CancelMeetingInput } from '@/calendar/dto/cancel-meeting.dto';
import type { RescheduleMeetingInput } from '@/calendar/dto/reschedule-meeting.dto';
import {
  type CalendarMeetingDetailRecord,
  CalendarMeetingQueryRepository,
} from '@/calendar/infrastructure/persistence/calendar-meeting-query.repository';
import { CalendarSchedulingRepository } from '@/calendar/infrastructure/persistence/calendar-scheduling.repository';

@Injectable()
export class RecurrenceSchedulingPlanService {
  constructor(
    private readonly meetingQueryRepository: CalendarMeetingQueryRepository,
    private readonly recurrenceService: CalendarRecurrenceService,
  ) {}

  async buildReschedulePlan(input: {
    organizationId: Meeting['organizationId'];
    current: CalendarMeetingDetailRecord;
    input: RescheduleMeetingInput;
    startAt: Date;
    endAt: Date;
  }): Promise<Parameters<CalendarSchedulingRepository['rescheduleMeetings']>> {
    if (input.input.scope === 'single') {
      return [
        input.organizationId,
        input.input,
        [this.toRescheduleUpdate(input.current, input.startAt, input.endAt)],
        [],
      ];
    }

    const recurrence = input.current.recurrence;
    const recurrenceSeriesId = input.current.meeting.recurrenceSeriesId;
    const selectedOriginal = input.current.meeting.recurrenceOriginalStartAt;
    if (!recurrence || !recurrenceSeriesId || !selectedOriginal) {
      throw new CalendarInvalidRecurrenceScopeError();
    }
    const series = await this.meetingQueryRepository.listMeetingsInSeries(
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

    const updates: Parameters<
      CalendarSchedulingRepository['rescheduleMeetings']
    >[2] = targets.map((record, index) => {
      const next = shifted[index];
      if (!next) throw new CalendarInvalidRecurrenceScopeError();
      return {
        id: record.meeting.id,
        startAt: next.startAt,
        endAt: next.endAt,
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
      return [
        input.organizationId,
        input.input,
        updates,
        allowedCanceledMeetingIds,
      ];
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
      return [
        input.organizationId,
        input.input,
        updates,
        allowedCanceledMeetingIds,
        {
          kind: 'update',
          seriesId: recurrence.id,
          changes: {
            ...this.recurrenceTermination(recurrence, shiftedStarts),
            byWeekday: shiftedWeekdays,
            timeZone: input.input.timeZone,
          },
        },
      ];
    }

    const sourceStarts = sourceRecords.map((record) => {
      const originalStartAt = record.meeting.recurrenceOriginalStartAt;
      if (!originalStartAt) throw new CalendarInvalidRecurrenceScopeError();
      return originalStartAt;
    });
    return [
      input.organizationId,
      input.input,
      updates,
      allowedCanceledMeetingIds,
      {
        kind: 'split',
        sourceSeriesId: recurrence.id,
        sourceChanges: this.recurrenceTermination(recurrence, sourceStarts),
        meetingIds: targets.map((record) => record.meeting.id),
        create: {
          frequency: recurrence.frequency,
          interval: recurrence.interval,
          ...this.recurrenceTermination(recurrence, shiftedStarts),
          byWeekday: shiftedWeekdays,
          timeZone: input.input.timeZone,
        },
      },
    ];
  }

  async resolveScopedMeetings(
    organizationId: Meeting['organizationId'],
    current: CalendarMeetingDetailRecord,
    scope: CancelMeetingInput['scope'],
  ): Promise<CalendarMeetingDetailRecord[]> {
    if (scope === 'single') return [current];
    const recurrenceSeriesId = current.meeting.recurrenceSeriesId;
    const recurrenceOriginalStartAt = current.meeting.recurrenceOriginalStartAt;
    if (!recurrenceSeriesId || !recurrenceOriginalStartAt) {
      throw new CalendarInvalidRecurrenceScopeError();
    }
    const series = await this.meetingQueryRepository.listMeetingsInSeries(
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

  private toRescheduleUpdate(
    record: CalendarMeetingDetailRecord,
    startAt: Date,
    endAt: Date,
  ): Parameters<CalendarSchedulingRepository['rescheduleMeetings']>[2][number] {
    return {
      id: record.meeting.id,
      startAt,
      endAt,
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
}
