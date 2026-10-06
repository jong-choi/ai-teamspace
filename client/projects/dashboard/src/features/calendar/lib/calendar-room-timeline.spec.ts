import type { MeetingSummary } from '@repo/client/api-client/schemas';
import { createRoomTimelineSlots } from '@core/features/calendar/lib/calendar-room-timeline';

import { describe, expect, test } from '@jest/globals';

const roomId = '11111111-1111-4111-8111-111111111111';

function meeting(overrides: Partial<MeetingSummary>): MeetingSummary {
  return {
    id: '22222222-2222-4222-8222-222222222222',
    organizationId: 'org-1',
    projectId: null,
    organizerUserId: 'user-1',
    title: '테스트 회의',
    category: 'team',
    timeZone: 'Asia/Seoul',
    locationType: 'meeting_room',
    meetingRoomId: roomId,
    locationText: null,
    iCalUid: '33333333-3333-4333-8333-333333333333',
    iCalSequence: 0,
    recurrenceSeriesId: null,
    canceledByUserId: null,
    cancelReason: null,
    startAt: '2026-10-05T00:30:00.000Z',
    endAt: '2026-10-05T01:30:00.000Z',
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    canceledAt: null,
    recurrenceOriginalStartAt: null,
    organizer: {
      id: 'user-1',
      name: '주최자',
      email: 'owner@example.com',
      image: null,
    },
    attendeeCount: 0,
    meetingRoom: {
      id: roomId,
      name: 'A 회의실',
      capacity: 8,
      floor: '3F',
      active: true,
    },
    project: null,
    recurrence: null,
    ...overrides,
  };
}

describe('회의실 타임라인 helper', () => {
  test('경계가 맞닿은 회의는 다음 슬롯을 막지 않는다', () => {
    const slots = createRoomTimelineSlots(
      [
        meeting({
          startAt: '2026-10-05T00:00:00.000Z',
          endAt: '2026-10-05T01:00:00.000Z',
        }),
      ],
      roomId,
      '2026-10-05',
      'Asia/Seoul',
    );

    expect(slots[0]?.busyMeetings).toHaveLength(1);
    expect(slots[1]?.busyMeetings).toHaveLength(0);
  });

  test('취소된 회의는 회의실 슬롯을 막지 않는다', () => {
    const slots = createRoomTimelineSlots(
      [meeting({ canceledAt: '2026-10-04T12:00:00.000Z' })],
      roomId,
      '2026-10-05',
      'Asia/Seoul',
    );

    expect(slots.every((slot) => slot.busyMeetings.length === 0)).toBe(true);
  });

  test('전날 시작해 선택 날짜까지 이어지는 회의도 실제 overlap 슬롯을 막는다', () => {
    const slots = createRoomTimelineSlots(
      [
        meeting({
          startAt: '2026-10-04T14:30:00.000Z',
          endAt: '2026-10-05T00:30:00.000Z',
        }),
      ],
      roomId,
      '2026-10-05',
      'Asia/Seoul',
    );

    expect(slots[0]?.busyMeetings).toHaveLength(1);
    expect(slots[1]?.busyMeetings).toHaveLength(0);
  });
});
