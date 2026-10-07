import type {
  AuthUserDirectoryService,
  AuthUserIdentity,
} from '@/auth/auth-user-directory.service';
import { CalendarIcsService } from '@/calendar/calendar-ics.service';
import { CalendarMeetingLoader } from '@/calendar/calendar-meeting.loader';
import type { Meeting } from '@/calendar/domain/meeting';
import type { MeetingAttendee } from '@/calendar/domain/meeting-attendee';
import type { MeetingRecurrenceSeries } from '@/calendar/domain/meeting-recurrence-series';
import { CalendarMeetingQueryRepository } from '@/calendar/infrastructure/persistence/calendar-meeting-query.repository';
import { MeetingRoomRepository } from '@/calendar/infrastructure/persistence/meeting-room.repository';
import type { OrganizationsService } from '@/organizations/organizations.service';

import { jest } from '@jest/globals';

class FakeCalendarMeetingQueryRepository extends CalendarMeetingQueryRepository {
  listMeetingsInRange =
    jest.fn<CalendarMeetingQueryRepository['listMeetingsInRange']>();
  findMeetingById =
    jest.fn<CalendarMeetingQueryRepository['findMeetingById']>();
  listMeetingsInSeries =
    jest.fn<CalendarMeetingQueryRepository['listMeetingsInSeries']>();
}

class FakeMeetingRoomRepository extends MeetingRoomRepository {
  listMeetingRooms = jest.fn<MeetingRoomRepository['listMeetingRooms']>();
  findMeetingRoomById = jest.fn<MeetingRoomRepository['findMeetingRoomById']>();
  createMeetingRoom = jest.fn<MeetingRoomRepository['createMeetingRoom']>();
  updateMeetingRoom = jest.fn<MeetingRoomRepository['updateMeetingRoom']>();
}

class FakeUserDirectory {
  findByIds = jest.fn<AuthUserDirectoryService['findByIds']>();
}

class FakeOrganizationsService {
  getDetail = jest.fn<OrganizationsService['getDetail']>();
}

const uid = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const seriesId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function meeting(overrides: Partial<Meeting> = {}): Meeting {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    organizationId: 'organization-a',
    projectId: null,
    organizerUserId: 'organizer-user',
    title: '주간 회의',
    category: 'team',
    startAt: new Date('2026-10-07T00:00:00.000Z'),
    endAt: new Date('2026-10-07T01:00:00.000Z'),
    timeZone: 'Asia/Seoul',
    locationType: 'online',
    meetingRoomId: null,
    locationText: 'Meet',
    agendaMarkdown: '# Agenda',
    notesMarkdown: '',
    reminderMinutes: 10,
    iCalUid: uid,
    iCalSequence: 1,
    recurrenceSeriesId: null,
    recurrenceOriginalStartAt: null,
    createdAt: new Date('2026-10-06T00:00:00.000Z'),
    updatedAt: new Date('2026-10-06T00:30:00.000Z'),
    canceledAt: null,
    canceledByUserId: null,
    cancelReason: null,
    ...overrides,
  };
}

function attendee(
  userId: MeetingAttendee['userId'],
  status: MeetingAttendee['status'],
): MeetingAttendee {
  return {
    meetingId: meeting().id,
    userId,
    status,
    createdAt: new Date('2026-10-06T00:00:00.000Z'),
    updatedAt: new Date('2026-10-06T00:00:00.000Z'),
  };
}

function recurrence(): MeetingRecurrenceSeries {
  return {
    id: seriesId,
    organizationId: 'organization-a',
    frequency: 'weekly',
    interval: 1,
    count: 3,
    until: null,
    byWeekday: ['WE'],
    timeZone: 'Asia/Seoul',
    createdAt: new Date('2026-10-06T00:00:00.000Z'),
    updatedAt: new Date('2026-10-06T00:00:00.000Z'),
  };
}

function record(
  meetingValue: Meeting,
  series: MeetingRecurrenceSeries | null = null,
) {
  return {
    meeting: meetingValue,
    meetingRoom: null,
    recurrence: series,
    attendees: [attendee('attendee-user', 'accepted')],
  };
}

function unfoldIcs(value: string): string {
  return value.replace(/\r?\n[ \t]/g, '').replaceAll('"', '');
}

const identities: AuthUserIdentity[] = [
  {
    id: 'organizer-user',
    name: 'Organizer',
    email: 'organizer@example.com',
    username: 'organizer',
    image: null,
  },
  {
    id: 'attendee-user',
    name: 'Attendee',
    email: 'attendee@example.com',
    username: 'attendee',
    image: null,
  },
];

describe('캘린더 ICS 서비스', () => {
  let repository: FakeCalendarMeetingQueryRepository;
  let meetingRoomRepository: FakeMeetingRoomRepository;
  let userDirectory: FakeUserDirectory;
  let organizationsService: FakeOrganizationsService;
  let service: CalendarIcsService;

  beforeEach(() => {
    repository = new FakeCalendarMeetingQueryRepository();
    meetingRoomRepository = new FakeMeetingRoomRepository();
    userDirectory = new FakeUserDirectory();
    organizationsService = new FakeOrganizationsService();
    service = new CalendarIcsService(
      repository,
      new CalendarMeetingLoader(repository, meetingRoomRepository),
      userDirectory,
      organizationsService,
    );
    organizationsService.getDetail.mockResolvedValue({
      organization: {
        id: 'organization-a',
        name: '조직 A',
        slug: 'organization-a',
        logo: null,
        createdAt: new Date(0).toISOString(),
      },
      role: 'member',
    });
    userDirectory.findByIds.mockResolvedValue(identities);
  });

  test('단일 Meeting은 UID, sequence, organizer, attendee RSVP를 직렬화한다', async () => {
    const selected = record(meeting({ iCalSequence: 4 }));
    repository.findMeetingById.mockResolvedValue(selected);

    const document = await service.exportMeeting(
      {
        userId: 'organizer-user',
        activeOrganizationIdCandidate: 'organization-a',
      },
      'organization-a',
      selected.meeting.id,
    );

    const content = unfoldIcs(document.content);
    expect(content).toContain(`UID:${uid}`);
    expect(content).toContain('SEQUENCE:4');
    expect(content).toContain('SUMMARY:주간 회의');
    expect(content).toContain('ORGANIZER');
    expect(content).toContain('organizer@example.com');
    expect(content).toContain('PARTSTAT=ACCEPTED');
    expect(content).toContain('attendee@example.com');
  });

  test('recurring export는 RRULE과 reschedule/cancel occurrence override를 같은 UID로 보존한다', async () => {
    const series = recurrence();
    const firstStart = new Date('2026-10-07T00:00:00.000Z');
    const secondOriginal = new Date('2026-10-14T00:00:00.000Z');
    const thirdOriginal = new Date('2026-10-21T00:00:00.000Z');
    const records = [
      record(
        meeting({
          recurrenceSeriesId: seriesId,
          recurrenceOriginalStartAt: firstStart,
          startAt: firstStart,
          endAt: new Date('2026-10-07T01:00:00.000Z'),
          iCalSequence: 1,
        }),
        series,
      ),
      record(
        meeting({
          id: '22222222-2222-4222-8222-222222222222',
          recurrenceSeriesId: seriesId,
          recurrenceOriginalStartAt: secondOriginal,
          startAt: new Date('2026-10-14T01:00:00.000Z'),
          endAt: new Date('2026-10-14T02:00:00.000Z'),
          iCalSequence: 2,
        }),
        series,
      ),
      record(
        meeting({
          id: '33333333-3333-4333-8333-333333333333',
          recurrenceSeriesId: seriesId,
          recurrenceOriginalStartAt: thirdOriginal,
          startAt: thirdOriginal,
          endAt: new Date('2026-10-21T01:00:00.000Z'),
          canceledAt: new Date('2026-10-10T00:00:00.000Z'),
          canceledByUserId: 'organizer-user',
          iCalSequence: 3,
        }),
        series,
      ),
    ];
    repository.findMeetingById.mockResolvedValue(records[0]!);
    repository.listMeetingsInSeries.mockResolvedValue(records);

    const document = await service.exportMeeting(
      {
        userId: 'organizer-user',
        activeOrganizationIdCandidate: 'organization-a',
      },
      'organization-a',
      records[0]!.meeting.id,
    );

    const content = unfoldIcs(document.content);
    expect(content).toContain('BEGIN:VTIMEZONE');
    expect(content).toContain('TZID:Asia/Seoul');
    expect(content).toContain('RRULE:FREQ=WEEKLY;COUNT=3;INTERVAL=1;BYDAY=WE');
    expect(content).toContain('SEQUENCE:3');
    expect(content).toContain('RECURRENCE-ID:20261014T000000Z');
    expect(content).toContain('DTSTART:20261014T010000Z');
    expect(content).toContain('RECURRENCE-ID:20261021T000000Z');
    expect(content).toContain('STATUS:CANCELLED');
  });

  test('DST를 건너는 recurrence는 TZID와 VTIMEZONE으로 같은 현지 시각을 보존한다', async () => {
    const series = {
      ...recurrence(),
      byWeekday: ['SU'] as MeetingRecurrenceSeries['byWeekday'],
      timeZone: 'America/New_York',
    };
    const starts = [
      new Date('2026-03-01T14:00:00.000Z'),
      new Date('2026-03-08T13:00:00.000Z'),
      new Date('2026-03-15T13:00:00.000Z'),
    ];
    const records = starts.map((startAt, index) =>
      record(
        meeting({
          id: `${index + 4}4444444-4444-4444-8444-444444444444`,
          recurrenceSeriesId: seriesId,
          recurrenceOriginalStartAt: startAt,
          startAt,
          endAt: new Date(startAt.getTime() + 3_600_000),
          timeZone: 'America/New_York',
        }),
        series,
      ),
    );
    repository.findMeetingById.mockResolvedValue(records[0]!);
    repository.listMeetingsInSeries.mockResolvedValue(records);

    const document = await service.exportMeeting(
      {
        userId: 'organizer-user',
        activeOrganizationIdCandidate: 'organization-a',
      },
      'organization-a',
      records[0]!.meeting.id,
    );

    const content = unfoldIcs(document.content);
    expect(content).toContain('TZID:America/New_York');
    expect(content).toContain('DTSTART;TZID=America/New_York:20260301T090000');
    expect(content).toContain('RECURRENCE-ID:20260308T130000Z');
    expect(content).toContain('DTSTART:20260308T130000Z');
  });

  test('iCalendar TEXT 필드는 쉼표, 세미콜론, 줄바꿈을 RFC 형식으로 escape한다', async () => {
    const selected = record(
      meeting({
        title: '회의, 테스트; 제목\n다음',
        agendaMarkdown: '첫째, 항목; 설명\n둘째',
        locationText: 'Room, A; 3F',
      }),
    );
    repository.findMeetingById.mockResolvedValue(selected);

    const document = await service.exportMeeting(
      {
        userId: 'organizer-user',
        activeOrganizationIdCandidate: 'organization-a',
      },
      'organization-a',
      selected.meeting.id,
    );

    const content = unfoldIcs(document.content);
    expect(content).toContain('SUMMARY:회의\\, 테스트\\; 제목\\n다음');
    expect(content).toContain('DESCRIPTION:첫째\\, 항목\\; 설명\\n둘째');
    expect(content).toContain('LOCATION:Room\\, A\\; 3F');
  });

  test('취소된 단일 Meeting은 같은 UID와 증가한 sequence로 CANCEL을 export한다', async () => {
    const selected = record(
      meeting({
        iCalSequence: 7,
        canceledAt: new Date('2026-10-06T03:00:00.000Z'),
        canceledByUserId: 'organizer-user',
      }),
    );
    repository.findMeetingById.mockResolvedValue(selected);

    const document = await service.exportMeeting(
      {
        userId: 'organizer-user',
        activeOrganizationIdCandidate: 'organization-a',
      },
      'organization-a',
      selected.meeting.id,
    );

    const content = unfoldIcs(document.content);
    expect(content).toContain('METHOD:CANCEL');
    expect(content).toContain(`UID:${uid}`);
    expect(content).toContain('SEQUENCE:7');
    expect(content).toContain('STATUS:CANCELLED');
    expect(content).toContain('TRANSP:TRANSPARENT');
  });
});
