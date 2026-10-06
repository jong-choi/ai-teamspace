import type { MeetingSummary } from '@repo/client/api-client/schemas';
import {
  dateKeyInTimeZone,
  formatInstantTime,
} from '@core/features/calendar/lib/calendar-datetime';

export type CalendarMeeting = MeetingSummary;

export function groupMeetingsByDate(
  meetings: readonly CalendarMeeting[],
  timeZone: string,
): Map<string, CalendarMeeting[]> {
  const grouped = new Map<string, CalendarMeeting[]>();
  for (const meeting of meetings) {
    const dateKey = dateKeyInTimeZone(meeting.startAt, timeZone);
    const items = grouped.get(dateKey) ?? [];
    items.push(meeting);
    grouped.set(dateKey, items);
  }
  for (const items of grouped.values()) {
    items.sort((left, right) => left.startAt.localeCompare(right.startAt));
  }
  return grouped;
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
  return meeting.attendeeCount + 1;
}
