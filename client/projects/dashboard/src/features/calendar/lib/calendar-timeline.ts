import type { MeetingSummary } from '@repo/client/api-client/schemas';
import {
  durationMinutes,
  minutesInDayForInstant,
} from '@core/features/calendar/lib/calendar-datetime';

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
): CalendarTimelineEventLayout[] {
  const timelineStart = CALENDAR_TIMELINE_START_HOUR * 60;
  const timelineEnd = CALENDAR_TIMELINE_END_HOUR * 60;
  const intervals = meetings
    .flatMap((meeting): TimelineInterval[] => {
      const duration = durationMinutes(meeting.startAt, meeting.endAt);
      if (!Number.isFinite(duration) || duration <= 0) return [];

      const startMinute = minutesInDayForInstant(meeting.startAt, timeZone);
      const endMinute = startMinute + duration;
      const visibleStart = Math.max(startMinute, timelineStart);
      const visibleEnd = Math.min(endMinute, timelineEnd);
      if (visibleEnd <= visibleStart) return [];

      return [
        {
          meeting,
          startMinute: visibleStart,
          endMinute: visibleEnd,
          layoutEndMinute: Math.min(
            timelineEnd,
            Math.max(visibleEnd, visibleStart + MIN_EVENT_VISUAL_MINUTES),
          ),
        },
      ];
    })
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
