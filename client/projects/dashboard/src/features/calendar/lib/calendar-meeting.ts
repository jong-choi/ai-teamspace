import type { MeetingSummary } from '@repo/client/api-client/schemas';
import { addCalendarDays } from '@core/features/calendar/lib/calendar-date-key';
import { formatInstantTime } from '@core/features/calendar/lib/calendar-format';
import { dateKeyInTimeZone } from '@core/features/calendar/lib/calendar-time-zone';

export type CalendarMeeting = MeetingSummary;

export function groupMeetingsByDate(
  meetings: readonly CalendarMeeting[],
  timeZone: string,
  options: { includeSpanningDates?: boolean } = {},
): Map<string, CalendarMeeting[]> {
  const grouped = new Map<string, CalendarMeeting[]>();
  for (const meeting of meetings) {
    const dateKeys = options.includeSpanningDates
      ? getMeetingDateKeys(meeting, timeZone)
      : [dateKeyInTimeZone(meeting.startAt, timeZone)];
    for (const dateKey of dateKeys) {
      const items = grouped.get(dateKey) ?? [];
      items.push(meeting);
      grouped.set(dateKey, items);
    }
  }
  for (const items of grouped.values()) {
    items.sort((left, right) => left.startAt.localeCompare(right.startAt));
  }
  return grouped;
}

export function getMeetingDateKeys(
  meeting: Pick<MeetingSummary, 'startAt' | 'endAt'>,
  timeZone: string,
): string[] {
  const startAt = new Date(meeting.startAt).getTime();
  const endAt = new Date(meeting.endAt).getTime();
  const startDateKey = dateKeyInTimeZone(meeting.startAt, timeZone);
  if (
    !Number.isFinite(startAt) ||
    !Number.isFinite(endAt) ||
    endAt <= startAt
  ) {
    return [startDateKey];
  }

  // Meeting intervals are half-open. Subtracting 1ms keeps an exact-midnight
  // end from incorrectly marking the following date as occupied.
  const finalDateKey = dateKeyInTimeZone(
    new Date(endAt - 1).toISOString(),
    timeZone,
  );
  const dateKeys = [startDateKey];
  let currentDateKey = startDateKey;
  while (currentDateKey < finalDateKey) {
    currentDateKey = addCalendarDays(currentDateKey, 1);
    dateKeys.push(currentDateKey);
  }
  return dateKeys;
}

export function getMeetingLocationLabel(
  meeting: Pick<
    MeetingSummary,
    'locationType' | 'locationText' | 'meetingRoom'
  >,
): string {
  if (meeting.meetingRoom) return meeting.meetingRoom.name;
  if (meeting.locationText) return meeting.locationText;
  if (meeting.locationType === 'online') return '온라인';
  return '장소 미정';
}

export function getMeetingTimeLabel(
  meeting: Pick<MeetingSummary, 'startAt' | 'endAt'>,
  timeZone: string,
): string {
  return `${formatInstantTime(meeting.startAt, timeZone)} – ${formatInstantTime(meeting.endAt, timeZone)}`;
}

export function getMeetingAttendeeCount(meeting: MeetingSummary): number {
  return meeting.attendeeCount;
}
