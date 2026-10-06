import type {
  AuthUserDirectoryService,
  AuthUserIdentity,
} from '#server/auth/auth-user-directory.service.js';
import type { CalendarService } from '#server/calendar/calendar.service.js';
import { CalendarIcsService } from '#server/calendar/calendar-ics.service.js';
import type { Meeting } from '#server/calendar/domain/meeting.js';
import type { MeetingAttendee } from '#server/calendar/domain/meeting-attendee.js';
import type { MeetingRecurrenceSeries } from '#server/calendar/domain/meeting-recurrence-series.js';
import { CalendarRepository } from '#server/calendar/infrastructure/persistence/calendar.repository.js';
import type { OrganizationsService } from '#server/organizations/organizations.service.js';

import { jest } from '@jest/globals';

class FakeCalendarRepository extends CalendarRepository {
  listMeetingsInRange = jest.fn<CalendarRepository['listMeetingsInRange']>();
  findMeetingById = jest.fn<CalendarRepository['findMeetingById']>();
  listMeetingsInSeries = jest.fn<CalendarRepository['listMeetingsInSeries']>();
  findParticipantBusyIntervals =
    jest.fn<CalendarRepository['findParticipantBusyIntervals']>();
  findRoomBusyIntervals =
    jest.fn<CalendarRepository['findRoomBusyIntervals']>();
  scheduleMeeting = jest.fn<CalendarRepository['scheduleMeeting']>();
  editMeetingDetails = jest.fn<CalendarRepository['editMeetingDetails']>();
  replaceMeetingAttendees =
    jest.fn<CalendarRepository['replaceMeetingAttendees']>();
  rescheduleMeetings = jest.fn<CalendarRepository['rescheduleMeetings']>();
  cancelMeetings = jest.fn<CalendarRepository['cancelMeetings']>();
  updateAttendeeRsvp = jest.fn<CalendarRepository['updateAttendeeRsvp']>();
  updateMeetingAgenda = jest.fn<CalendarRepository['updateMeetingAgenda']>();
  updateMeetingNotes = jest.fn<CalendarRepository['updateMeetingNotes']>();
  listMeetingRooms = jest.fn<CalendarRepository['listMeetingRooms']>();
  findMeetingRoomById = jest.fn<CalendarRepository['findMeetingRoomById']>();
  createMeetingRoom = jest.fn<CalendarRepository['createMeetingRoom']>();
  updateMeetingRoom = jest.fn<CalendarRepository['updateMeetingRoom']>();
}

class FakeMeetingReader {
  requireMeeting = jest.fn<CalendarService['requireMeeting']>();
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
  userId: string,
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
  let repository: FakeCalendarRepository;
  let meetingReader: FakeMeetingReader;
  let userDirectory: FakeUserDirectory;
  let organizationsService: FakeOrganizationsService;
  let service: CalendarIcsService;

  beforeEach(() => {
    repository = new FakeCalendarRepository();
    meetingReader = new FakeMeetingReader();
    userDirectory = new FakeUserDirectory();
    organizationsService = new FakeOrganizationsService();
    service = new CalendarIcsService(
      repository,
      meetingReader,
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
    meetingReader.requireMeeting.mockResolvedValue(selected);

    const document = await service.exportMeeting(
      {
        userId: 'organizer-user',
        activeOrganizationIdCandidate: 'organization-a',
        providerCredential: {},
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
    meetingReader.requireMeeting.mockResolvedValue(records[0]!);
    repository.listMeetingsInSeries.mockResolvedValue(records);

    const document = await service.exportMeeting(
      {
        userId: 'organizer-user',
        activeOrganizationIdCandidate: 'organization-a',
        providerCredential: {},
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
    meetingReader.requireMeeting.mockResolvedValue(records[0]!);
    repository.listMeetingsInSeries.mockResolvedValue(records);

    const document = await service.exportMeeting(
      {
        userId: 'organizer-user',
        activeOrganizationIdCandidate: 'organization-a',
        providerCredential: {},
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
    meetingReader.requireMeeting.mockResolvedValue(selected);

    const document = await service.exportMeeting(
      {
        userId: 'organizer-user',
        activeOrganizationIdCandidate: 'organization-a',
        providerCredential: {},
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
    meetingReader.requireMeeting.mockResolvedValue(selected);

    const document = await service.exportMeeting(
      {
        userId: 'organizer-user',
        activeOrganizationIdCandidate: 'organization-a',
        providerCredential: {},
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
