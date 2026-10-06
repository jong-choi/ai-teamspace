import {
  type MeetingDetailResponse,
  MeetingDetailSchema as MeetingDetailResponseSchema,
} from '@/calendar/dto/meeting.dto';

export function createMeetingDetailResponseFixture(
  overrides: Partial<MeetingDetailResponse> = {},
): MeetingDetailResponse {
  return MeetingDetailResponseSchema.parse({
    id: '11111111-1111-4111-8111-111111111111',
    organizationId: 'organization-a',
    projectId: null,
    organizerUserId: 'organizer-user',
    title: '주간 회의',
    category: 'team',
    startAt: '2026-10-07T00:00:00.000Z',
    endAt: '2026-10-07T01:00:00.000Z',
    timeZone: 'Asia/Seoul',
    locationType: 'online',
    meetingRoomId: null,
    locationText: null,
    agendaMarkdown: '',
    notesMarkdown: '',
    reminderMinutes: null,
    iCalUid: '22222222-2222-4222-8222-222222222222',
    iCalSequence: 0,
    recurrenceSeriesId: null,
    recurrenceOriginalStartAt: null,
    createdAt: '2026-10-06T00:00:00.000Z',
    updatedAt: '2026-10-06T00:00:00.000Z',
    canceledAt: null,
    canceledByUserId: null,
    cancelReason: null,
    organizer: {
      id: 'organizer-user',
      name: '회의 주최자',
      email: 'organizer@example.com',
      image: null,
    },
    attendees: [],
    meetingRoom: null,
    project: null,
    recurrence: null,
    ...overrides,
  });
}
