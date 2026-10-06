import type { MeetingSummary } from '@repo/client/api-client/schemas';
import { formatInstantTime } from '@core/features/calendar/lib/calendar-format';
import { zonedDateTimeToIso } from '@core/features/calendar/lib/calendar-time-zone';

export const ROOM_TIMELINE_START_HOUR = 9;
export const ROOM_TIMELINE_END_HOUR = 18;

export type CalendarRoomSlot = {
  hour: number;
  startTime: string;
  endTime: string;
  busyMeetings: MeetingSummary[];
};

export function createRoomTimelineSlots(
  meetings: readonly MeetingSummary[],
  roomId: string,
  dateKey: string,
  timeZone: string,
): CalendarRoomSlot[] {
  const roomMeetings = meetings.filter(
    (meeting) => !meeting.canceledAt && meeting.meetingRoomId === roomId,
  );

  return Array.from(
    { length: ROOM_TIMELINE_END_HOUR - ROOM_TIMELINE_START_HOUR },
    (_, index) => {
      const hour = ROOM_TIMELINE_START_HOUR + index;
      const startTime = `${String(hour).padStart(2, '0')}:00`;
      const endTime = `${String(hour + 1).padStart(2, '0')}:00`;
      const slotStart = new Date(
        zonedDateTimeToIso(dateKey, startTime, timeZone),
      ).getTime();
      const slotEnd = new Date(
        zonedDateTimeToIso(dateKey, endTime, timeZone),
      ).getTime();
      const busyMeetings = roomMeetings.filter((meeting) => {
        const meetingStart = new Date(meeting.startAt).getTime();
        const meetingEnd = new Date(meeting.endAt).getTime();
        return meetingStart < slotEnd && meetingEnd > slotStart;
      });

      return { hour, startTime, endTime, busyMeetings };
    },
  );
}

export function roomTimelineMeetingLabel(
  meeting: MeetingSummary,
  timeZone: string,
): string {
  return `${formatInstantTime(meeting.startAt, timeZone)}–${formatInstantTime(meeting.endAt, timeZone)} ${meeting.title}`;
}
