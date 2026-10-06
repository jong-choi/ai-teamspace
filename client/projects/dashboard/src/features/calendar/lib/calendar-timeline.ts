import type { MeetingSummary } from '@repo/client/api-client/schemas';
import {
  minutesInDayForInstant,
  zonedDateTimeToIso,
} from '@core/features/calendar/lib/calendar-time-zone';

export const CALENDAR_TIMELINE_START_HOUR = 8;
export const CALENDAR_TIMELINE_END_HOUR = 21;
export const CALENDAR_TIMELINE_HOUR_HEIGHT = 58;

const MIN_EVENT_VISUAL_MINUTES = 30;

export type CalendarTimelineEventLayout = {
  meeting: MeetingSummary;
  top: number;
  height: number;
  laneIndex: number;
  laneCount: number;
};

type TimelineInterval = {
  meeting: MeetingSummary;
  startMinute: number;
  endMinute: number;
  layoutEndMinute: number;
};

export function createCalendarTimelineLayouts(
  meetings: readonly MeetingSummary[],
  timeZone: string,
  dateKey: string,
): CalendarTimelineEventLayout[] {
  const timelineStart = CALENDAR_TIMELINE_START_HOUR * 60;
  const timelineEnd = CALENDAR_TIMELINE_END_HOUR * 60;
  const timelineStartAt = new Date(
    zonedDateTimeToIso(
      dateKey,
      `${String(CALENDAR_TIMELINE_START_HOUR).padStart(2, '0')}:00`,
      timeZone,
    ),
  ).getTime();
  const timelineEndAt = new Date(
    zonedDateTimeToIso(
      dateKey,
      `${String(CALENDAR_TIMELINE_END_HOUR).padStart(2, '0')}:00`,
      timeZone,
    ),
  ).getTime();

  const intervals = meetings
    .flatMap((meeting): TimelineInterval[] => {
      const meetingStartAt = new Date(meeting.startAt).getTime();
      const meetingEndAt = new Date(meeting.endAt).getTime();
      if (
        !Number.isFinite(meetingStartAt) ||
        !Number.isFinite(meetingEndAt) ||
        meetingEndAt <= meetingStartAt
      ) {
        return [];
      }

      const visibleStartAt = Math.max(meetingStartAt, timelineStartAt);
      const visibleEndAt = Math.min(meetingEndAt, timelineEndAt);
      if (visibleEndAt <= visibleStartAt) return [];

      const visibleStartInstant = new Date(visibleStartAt).toISOString();
      const visibleEndInstant = new Date(visibleEndAt).toISOString();
      const visibleStart = minutesInDayForInstant(
        visibleStartInstant,
        timeZone,
      );
      const visibleEnd = minutesInDayForInstant(visibleEndInstant, timeZone);

      return [
        {
          meeting,
          startMinute: Math.max(visibleStart, timelineStart),
          endMinute: Math.min(visibleEnd, timelineEnd),
          layoutEndMinute: Math.min(
            timelineEnd,
            Math.max(visibleEnd, visibleStart + MIN_EVENT_VISUAL_MINUTES),
          ),
        },
      ];
    })
    .filter((interval) => interval.endMinute > interval.startMinute)
    .sort(
      (left, right) =>
        left.startMinute - right.startMinute ||
        left.endMinute - right.endMinute ||
        left.meeting.id.localeCompare(right.meeting.id),
    );

  const output: CalendarTimelineEventLayout[] = [];
  let cluster: TimelineInterval[] = [];
  let clusterEnd = Number.NEGATIVE_INFINITY;

  const flushCluster = () => {
    if (cluster.length === 0) return;
    const laneEnds: number[] = [];
    const assigned = cluster.map((interval) => {
      let laneIndex = laneEnds.findIndex(
        (laneEnd) => laneEnd <= interval.startMinute,
      );
      if (laneIndex === -1) {
        laneIndex = laneEnds.length;
        laneEnds.push(interval.layoutEndMinute);
      } else {
        laneEnds[laneIndex] = interval.layoutEndMinute;
      }
      return { interval, laneIndex };
    });
    const laneCount = Math.max(1, laneEnds.length);

    for (const { interval, laneIndex } of assigned) {
      output.push({
        meeting: interval.meeting,
        top:
          ((interval.startMinute - timelineStart) / 60) *
          CALENDAR_TIMELINE_HOUR_HEIGHT,
        height:
          ((interval.layoutEndMinute - interval.startMinute) / 60) *
          CALENDAR_TIMELINE_HOUR_HEIGHT,
        laneIndex,
        laneCount,
      });
    }

    cluster = [];
    clusterEnd = Number.NEGATIVE_INFINITY;
  };

  for (const interval of intervals) {
    if (cluster.length > 0 && interval.startMinute >= clusterEnd)
      flushCluster();
    cluster.push(interval);
    clusterEnd = Math.max(clusterEnd, interval.layoutEndMinute);
  }
  flushCluster();

  return output;
}
