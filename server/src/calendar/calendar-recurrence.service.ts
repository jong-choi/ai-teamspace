import { Injectable } from '@nestjs/common';

import { CalendarInvalidRecurrenceError } from '@/calendar/domain/calendar.error';
import type { MeetingRecurrenceSeries } from '@/calendar/domain/meeting-recurrence-series';
import type { RecurrenceRuleInput } from '@/calendar/dto/recurrence.dto';

import type { Weekday } from 'rrule';
import * as rruleNamespace from 'rrule';

const { datetime, RRule } = (rruleNamespace.default ??
  rruleNamespace) as typeof import('rrule');
const maximumMaterializedOccurrences = 500;

const frequencyByName = {
  daily: RRule.DAILY,
  weekly: RRule.WEEKLY,
  monthly: RRule.MONTHLY,
} as const;

const weekdayByName = {
  MO: RRule.MO,
  TU: RRule.TU,
  WE: RRule.WE,
  TH: RRule.TH,
  FR: RRule.FR,
  SA: RRule.SA,
  SU: RRule.SU,
} as const satisfies Record<string, Weekday>;

export type MaterializedOccurrence = {
  startAt: Date;
  endAt: Date;
  originalStartAt: Date;
};

type ZonedParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  millisecond: number;
};

@Injectable()
export class CalendarRecurrenceService {
  materialize(input: {
    startAt: Date;
    endAt: Date;
    rule: RecurrenceRuleInput;
  }): MaterializedOccurrence[] {
    const durationMs = input.endAt.getTime() - input.startAt.getTime();
    if (durationMs <= 0) throw new CalendarInvalidRecurrenceError();

    const until = input.rule.until ? new Date(input.rule.until) : undefined;
    if (until && until.getTime() < input.startAt.getTime()) {
      throw new CalendarInvalidRecurrenceError();
    }

    const startParts = this.toZonedParts(input.startAt, input.rule.timeZone);
    const floatingUntil = until
      ? this.toFloatingDate(this.toZonedParts(until, input.rule.timeZone))
      : undefined;
    const recurrence = this.createFloatingRule(
      startParts,
      input.rule,
      floatingUntil,
    );

    let overflow = false;
    const floatingStarts = recurrence.all((_date, length) => {
      if (length >= maximumMaterializedOccurrences) {
        overflow = true;
        return false;
      }
      return true;
    });

    if (overflow || floatingStarts.length === 0) {
      throw new CalendarInvalidRecurrenceError();
    }

    const normalizedStarts = floatingStarts.map((date) =>
      this.fromFloatingDate(date, input.rule.timeZone, startParts.millisecond),
    );
    if (normalizedStarts[0]?.getTime() !== input.startAt.getTime()) {
      throw new CalendarInvalidRecurrenceError();
    }

    const occurrences = normalizedStarts
      .filter((startAt) => !until || startAt.getTime() <= until.getTime())
      .map((startAt) => ({
        startAt,
        endAt: new Date(startAt.getTime() + durationMs),
        originalStartAt: new Date(startAt),
      }));

    if (occurrences.length < 2) throw new CalendarInvalidRecurrenceError();

    for (let index = 1; index < occurrences.length; index += 1) {
      const previous = occurrences[index - 1];
      const current = occurrences[index];
      if (
        previous &&
        current &&
        previous.endAt.getTime() > current.startAt.getTime()
      ) {
        throw new CalendarInvalidRecurrenceError();
      }
    }

    return occurrences;
  }

  shiftOccurrences(input: {
    occurrences: readonly { startAt: Date }[];
    selectedStartAt: Date;
    selectedTimeZone: string;
    requestedStartAt: Date;
    requestedEndAt: Date;
    requestedTimeZone: string;
  }): MaterializedOccurrence[] {
    const durationMs =
      input.requestedEndAt.getTime() - input.requestedStartAt.getTime();
    if (durationMs <= 0) throw new CalendarInvalidRecurrenceError();

    const selectedOld = this.toZonedParts(
      input.selectedStartAt,
      input.selectedTimeZone,
    );
    const selectedNew = this.toZonedParts(
      input.requestedStartAt,
      input.requestedTimeZone,
    );
    const dayShift = Math.round(
      (Date.UTC(selectedNew.year, selectedNew.month - 1, selectedNew.day) -
        Date.UTC(selectedOld.year, selectedOld.month - 1, selectedOld.day)) /
        86_400_000,
    );

    return input.occurrences.map((occurrence) => {
      const old = this.toZonedParts(occurrence.startAt, input.selectedTimeZone);
      const shiftedDate = new Date(
        Date.UTC(old.year, old.month - 1, old.day + dayShift),
      );
      const startAt = this.localPartsToInstant(
        {
          year: shiftedDate.getUTCFullYear(),
          month: shiftedDate.getUTCMonth() + 1,
          day: shiftedDate.getUTCDate(),
          hour: selectedNew.hour,
          minute: selectedNew.minute,
          second: selectedNew.second,
          millisecond: selectedNew.millisecond,
        },
        input.requestedTimeZone,
      );
      return {
        startAt,
        endAt: new Date(startAt.getTime() + durationMs),
        originalStartAt: new Date(startAt),
      };
    });
  }

  shiftWeekdays(
    weekdays: readonly MeetingRecurrenceSeries['byWeekday'][number][],
    dayShift: number,
  ): MeetingRecurrenceSeries['byWeekday'] {
    if (weekdays.length === 0 || dayShift % 7 === 0) return [...weekdays];
    const order = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'] as const;
    return weekdays.map((weekday) => {
      const current = order.indexOf(weekday);
      const shifted = (((current + dayShift) % 7) + 7) % 7;
      return order[shifted] as (typeof order)[number];
    });
  }

  calendarDayShift(input: {
    from: Date;
    fromTimeZone: string;
    to: Date;
    toTimeZone: string;
  }): number {
    const from = this.toZonedParts(input.from, input.fromTimeZone);
    const to = this.toZonedParts(input.to, input.toTimeZone);
    return Math.round(
      (Date.UTC(to.year, to.month - 1, to.day) -
        Date.UTC(from.year, from.month - 1, from.day)) /
        86_400_000,
    );
  }

  private createFloatingRule(
    start: ZonedParts,
    rule: RecurrenceRuleInput,
    until: Date | undefined,
  ): InstanceType<typeof RRule> {
    return new RRule({
      freq: frequencyByName[rule.frequency],
      interval: rule.interval,
      count: rule.count,
      until,
      byweekday:
        rule.byWeekday.length > 0
          ? rule.byWeekday.map((weekday) => weekdayByName[weekday])
          : undefined,
      dtstart: this.toFloatingDate(start),
    });
  }

  private toFloatingDate(parts: ZonedParts): Date {
    return datetime(
      parts.year,
      parts.month,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
    );
  }

  private fromFloatingDate(
    floating: Date,
    timeZone: string,
    millisecond: number,
  ): Date {
    return this.localPartsToInstant(
      {
        year: floating.getUTCFullYear(),
        month: floating.getUTCMonth() + 1,
        day: floating.getUTCDate(),
        hour: floating.getUTCHours(),
        minute: floating.getUTCMinutes(),
        second: floating.getUTCSeconds(),
        millisecond,
      },
      timeZone,
    );
  }

  private localPartsToInstant(parts: ZonedParts, timeZone: string): Date {
    const targetAsUtc = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
      parts.millisecond,
    );
    let candidate = targetAsUtc;

    for (let attempt = 0; attempt < 4; attempt += 1) {
      const observed = this.toZonedParts(new Date(candidate), timeZone);
      const observedAsUtc = Date.UTC(
        observed.year,
        observed.month - 1,
        observed.day,
        observed.hour,
        observed.minute,
        observed.second,
        parts.millisecond,
      );
      const adjustment = targetAsUtc - observedAsUtc;
      candidate += adjustment;
      if (adjustment === 0) break;
    }

    const result = new Date(candidate);
    const resolved = this.toZonedParts(result, timeZone);
    if (
      resolved.year !== parts.year ||
      resolved.month !== parts.month ||
      resolved.day !== parts.day ||
      resolved.hour !== parts.hour ||
      resolved.minute !== parts.minute ||
      resolved.second !== parts.second
    ) {
      throw new CalendarInvalidRecurrenceError();
    }
    return result;
  }

  private toZonedParts(date: Date, timeZone: string): ZonedParts {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });
    const values = new Map(
      formatter
        .formatToParts(date)
        .filter((part) => part.type !== 'literal')
        .map((part) => [part.type, Number(part.value)]),
    );
    const year = values.get('year');
    const month = values.get('month');
    const day = values.get('day');
    const hour = values.get('hour');
    const minute = values.get('minute');
    const second = values.get('second');
    if (
      year === undefined ||
      month === undefined ||
      day === undefined ||
      hour === undefined ||
      minute === undefined ||
      second === undefined
    ) {
      throw new CalendarInvalidRecurrenceError();
    }
    return {
      year,
      month,
      day,
      hour,
      minute,
      second,
      millisecond: date.getUTCMilliseconds(),
    };
  }
}
