import type { MeetingSummary } from '@repo/client/api-client/schemas';
import {
  CALENDAR_TIMELINE_HOUR_HEIGHT,
  createCalendarTimelineLayouts,
} from '@core/features/calendar/lib/calendar-timeline';

import { describe, expect, test } from '@jest/globals';

const baseMeeting: MeetingSummary = {
  id: '00000000-0000-0000-0000-000000000001',
  organizationId: 'org-1',
  projectId: null,
  organizerUserId: 'user-1',
  title: '회의',
  category: 'team',
  timeZone: 'Asia/Seoul',
  locationType: 'online',
  meetingRoomId: null,
  locationText: null,
  iCalUid: '00000000-0000-0000-0000-000000000002',
  iCalSequence: 0,
  recurrenceSeriesId: null,
  canceledByUserId: null,
  cancelReason: null,
  startAt: '2026-10-05T01:00:00.000Z',
  endAt: '2026-10-05T02:00:00.000Z',
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
  canceledAt: null,
  recurrenceOriginalStartAt: null,
  organizer: {
    id: 'user-1',
    name: 'Alex Kim',
    email: 'alex@example.com',
    image: null,
  },
  attendeeCount: 1,
  meetingRoom: null,
  project: null,
  recurrence: null,
};

describe('회의일정 timeline layout', () => {
  test('시작 분과 duration을 실제 vertical placement에 반영한다', () => {
    const meeting = {
      ...baseMeeting,
      startAt: '2026-10-05T01:30:00.000Z',
      endAt: '2026-10-05T02:45:00.000Z',
    };

    const [layout] = createCalendarTimelineLayouts([meeting], 'Asia/Seoul');

    expect(layout?.top).toBe(2.5 * CALENDAR_TIMELINE_HOUR_HEIGHT);
    expect(layout?.height).toBe(1.25 * CALENDAR_TIMELINE_HOUR_HEIGHT);
    expect(layout?.laneIndex).toBe(0);
    expect(layout?.laneCount).toBe(1);
  });

  test('겹치는 회의는 서로 다른 lane으로 배치한다', () => {
    const first = {
      ...baseMeeting,
      id: '00000000-0000-0000-0000-000000000011',
      startAt: '2026-10-05T01:00:00.000Z',
      endAt: '2026-10-05T02:00:00.000Z',
    };
    const second = {
      ...baseMeeting,
      id: '00000000-0000-0000-0000-000000000012',
      startAt: '2026-10-05T01:30:00.000Z',
      endAt: '2026-10-05T02:30:00.000Z',
    };

    const layouts = createCalendarTimelineLayouts(
      [first, second],
      'Asia/Seoul',
    );

    expect(layouts.map((layout) => layout.laneIndex)).toEqual([0, 1]);
    expect(layouts.map((layout) => layout.laneCount)).toEqual([2, 2]);
  });

  test('화면 시간축 밖에서 시작한 회의는 보이는 구간만 clip한다', () => {
    const meeting = {
      ...baseMeeting,
      startAt: '2026-10-04T22:30:00.000Z',
      endAt: '2026-10-04T23:30:00.000Z',
    };

    const [layout] = createCalendarTimelineLayouts([meeting], 'Asia/Seoul');

    expect(layout?.top).toBe(0);
    expect(layout?.height).toBe(0.5 * CALENDAR_TIMELINE_HOUR_HEIGHT);
  });
});
