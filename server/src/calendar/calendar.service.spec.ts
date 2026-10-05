import type { AuthUserDirectoryService } from '#server/auth/auth-user-directory.service.js';
import { CalendarService } from '#server/calendar/calendar.service.js';
import {
  CalendarAttendeeNotMemberError,
  CalendarMeetingRoomInactiveError,
} from '#server/calendar/domain/calendar.error.js';
import type { Meeting } from '#server/calendar/domain/meeting.js';
import type { MeetingRoom } from '#server/calendar/domain/meeting-room.js';
import { CalendarRepository } from '#server/calendar/infrastructure/persistence/calendar.repository.js';
import { CalendarProjectReferenceProvider } from '#server/calendar/infrastructure/project/calendar-project-reference.provider.js';
import { OrganizationAccessDeniedError } from '#server/organizations/domain/organization.error.js';
import type { OrganizationMember } from '#server/organizations/domain/organization-member.js';
import type { OrganizationActorContext } from '#server/organizations/organization-actor-context.js';
import type { OrganizationsService } from '#server/organizations/organizations.service.js';

import { jest } from '@jest/globals';

class FakeCalendarRepository extends CalendarRepository {
  listMeetingsInRange = jest.fn<CalendarRepository['listMeetingsInRange']>();
  findMeetingById = jest.fn<CalendarRepository['findMeetingById']>();
  createMeetingWithAttendees =
    jest.fn<CalendarRepository['createMeetingWithAttendees']>();
  editMeetingDetails = jest.fn<CalendarRepository['editMeetingDetails']>();
  listMeetingRooms = jest.fn<CalendarRepository['listMeetingRooms']>();
  findMeetingRoomById = jest.fn<CalendarRepository['findMeetingRoomById']>();
  createMeetingRoom = jest.fn<CalendarRepository['createMeetingRoom']>();
  updateMeetingRoom = jest.fn<CalendarRepository['updateMeetingRoom']>();
}

class FakeProjectReferenceProvider extends CalendarProjectReferenceProvider {
  assertReference =
    jest.fn<CalendarProjectReferenceProvider['assertReference']>();
  listSummaries = jest.fn<CalendarProjectReferenceProvider['listSummaries']>();
}

class FakeOrganizationsService {
  getDetail = jest.fn<OrganizationsService['getDetail']>();
  listMembersByUserIds =
    jest.fn<OrganizationsService['listMembersByUserIds']>();
  searchMemberUserIds = jest.fn<OrganizationsService['searchMemberUserIds']>();
  assertAdministrativeAccess =
    jest.fn<OrganizationsService['assertAdministrativeAccess']>();
}

class FakeUserDirectory {
  findByIds = jest.fn<AuthUserDirectoryService['findByIds']>();
}

const context: OrganizationActorContext = {
  userId: 'organizer-user',
  activeOrganizationIdCandidate: 'organization-a',
  providerCredential: {},
};

function organizationAccess() {
  return {
    organization: {
      id: 'organization-a',
      name: '조직 A',
      slug: 'organization-a',
      logo: null,
      createdAt: new Date(0).toISOString(),
    },
    role: 'member' as const,
  };
}

function member(userId: string): OrganizationMember {
  return {
    id: `member-${userId}`,
    organizationId: 'organization-a',
    userId,
    role: 'member',
    createdAt: new Date(0).toISOString(),
    user: {
      id: userId,
      name: `사용자 ${userId}`,
      email: `${userId}@example.com`,
      image: null,
    },
  };
}

function identity(userId: string) {
  return {
    id: userId,
    name: `사용자 ${userId}`,
    email: `${userId}@example.com`,
    username: null,
    image: null,
  };
}

function meeting(overrides: Partial<Meeting> = {}): Meeting {
  return {
    id: '00000000-0000-4000-8000-000000000001',
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
    locationText: null,
    agendaMarkdown: '',
    notesMarkdown: '',
    reminderMinutes: null,
    createdAt: new Date('2026-10-06T00:00:00.000Z'),
    updatedAt: new Date('2026-10-06T00:00:00.000Z'),
    canceledAt: null,
    ...overrides,
  };
}

function room(overrides: Partial<MeetingRoom> = {}): MeetingRoom {
  return {
    id: '00000000-0000-4000-8000-000000000002',
    organizationId: 'organization-a',
    name: '회의실 A',
    capacity: 8,
    floor: '3F',
    description: null,
    active: true,
    createdAt: new Date('2026-10-06T00:00:00.000Z'),
    updatedAt: new Date('2026-10-06T00:00:00.000Z'),
    ...overrides,
  };
}

function createInput() {
  return {
    title: '주간 회의',
    category: 'team' as const,
    startAt: '2026-10-07T09:00:00+09:00',
    endAt: '2026-10-07T10:00:00+09:00',
    timeZone: 'Asia/Seoul',
    locationType: 'online' as const,
    attendeeUserIds: ['attendee-user'],
  };
}

describe('캘린더 서비스', () => {
  let repository: FakeCalendarRepository;
  let projectReferenceProvider: FakeProjectReferenceProvider;
  let organizationsService: FakeOrganizationsService;
  let userDirectory: FakeUserDirectory;
  let service: CalendarService;

  beforeEach(() => {
    repository = new FakeCalendarRepository();
    projectReferenceProvider = new FakeProjectReferenceProvider();
    organizationsService = new FakeOrganizationsService();
    userDirectory = new FakeUserDirectory();
    service = new CalendarService(
      repository,
      projectReferenceProvider,
      organizationsService,
      userDirectory,
    );

    organizationsService.getDetail.mockResolvedValue(organizationAccess());
    organizationsService.assertAdministrativeAccess.mockResolvedValue();
    projectReferenceProvider.listSummaries.mockResolvedValue([]);
  });

  test('회의 생성 시 참석자 user id를 중복 제거하고 한 트랜잭션 입력으로 전달한다', async () => {
    organizationsService.listMembersByUserIds.mockImplementation(
      async (_context, _organizationId, userIds) =>
        userIds.map((userId) => member(userId)),
    );
    repository.createMeetingWithAttendees.mockImplementation(async (input) => ({
      meeting: meeting({
        organizerUserId: input.organizerUserId,
        title: input.title,
        category: input.category,
        startAt: input.startAt,
        endAt: input.endAt,
        timeZone: input.timeZone,
        locationType: input.locationType,
        meetingRoomId: input.meetingRoomId,
        locationText: input.locationText,
        projectId: input.projectId,
        agendaMarkdown: input.agendaMarkdown,
        notesMarkdown: input.notesMarkdown,
        reminderMinutes: input.reminderMinutes,
      }),
      meetingRoom: null,
      attendees: input.attendeeUserIds.map((userId) => ({
        meetingId: '00000000-0000-4000-8000-000000000001',
        userId,
        status: 'pending' as const,
        createdAt: new Date('2026-10-06T00:00:00.000Z'),
        updatedAt: new Date('2026-10-06T00:00:00.000Z'),
      })),
    }));
    userDirectory.findByIds.mockImplementation(async (userIds) =>
      userIds.map(identity),
    );

    const result = await service.createMeeting(context, 'organization-a', {
      ...createInput(),
      attendeeUserIds: ['attendee-user', 'attendee-user'],
    });

    expect(repository.createMeetingWithAttendees).toHaveBeenCalledWith(
      expect.objectContaining({ attendeeUserIds: ['attendee-user'] }),
    );
    expect(result.attendees).toHaveLength(1);
  });

  test('현재 조직 멤버가 아닌 참석자가 있으면 회의 생성을 거부한다', async () => {
    organizationsService.listMembersByUserIds.mockResolvedValue([
      member('organizer-user'),
    ]);

    await expect(
      service.createMeeting(context, 'organization-a', createInput()),
    ).rejects.toBeInstanceOf(CalendarAttendeeNotMemberError);
    expect(repository.createMeetingWithAttendees).not.toHaveBeenCalled();
  });

  test('비활성 회의실에는 새 회의를 예약하지 않는다', async () => {
    organizationsService.listMembersByUserIds.mockResolvedValue([
      member('organizer-user'),
    ]);
    repository.findMeetingRoomById.mockResolvedValue(room({ active: false }));

    await expect(
      service.createMeeting(context, 'organization-a', {
        ...createInput(),
        attendeeUserIds: [],
        locationType: 'meeting_room',
        meetingRoomId: '00000000-0000-4000-8000-000000000002',
      }),
    ).rejects.toBeInstanceOf(CalendarMeetingRoomInactiveError);
  });

  test('주최자가 아닌 사용자의 회의 수정은 조직 관리 권한 경계를 통과해야 한다', async () => {
    repository.findMeetingById.mockResolvedValue({
      meeting: meeting({ organizerUserId: 'another-organizer' }),
      meetingRoom: null,
      attendees: [],
    });
    organizationsService.assertAdministrativeAccess.mockRejectedValue(
      new OrganizationAccessDeniedError(),
    );

    await expect(
      service.updateMeeting(context, 'organization-a', meeting().id, {
        title: '수정된 제목',
      }),
    ).rejects.toBeInstanceOf(OrganizationAccessDeniedError);
    expect(
      organizationsService.assertAdministrativeAccess,
    ).toHaveBeenCalledWith(context, 'organization-a');
    expect(repository.editMeetingDetails).not.toHaveBeenCalled();
  });

  test('회의실에서 온라인으로 장소를 바꾸면 기존 회의실 참조를 함께 제거한다', async () => {
    const current = meeting({
      locationType: 'meeting_room',
      meetingRoomId: '00000000-0000-4000-8000-000000000002',
    });
    repository.findMeetingById.mockResolvedValue({
      meeting: current,
      meetingRoom: room(),
      attendees: [],
    });
    repository.editMeetingDetails.mockImplementation(async (input) => ({
      meeting: meeting({
        ...current,
        locationType: input.changes.locationType ?? current.locationType,
        meetingRoomId:
          input.changes.meetingRoomId === undefined
            ? current.meetingRoomId
            : input.changes.meetingRoomId,
      }),
      meetingRoom: null,
      attendees: [],
    }));
    userDirectory.findByIds.mockResolvedValue([identity('organizer-user')]);

    await service.updateMeeting(context, 'organization-a', current.id, {
      locationType: 'online',
    });

    expect(repository.editMeetingDetails).toHaveBeenCalledWith(
      expect.objectContaining({
        changes: expect.objectContaining({
          locationType: 'online',
          meetingRoomId: null,
        }),
      }),
    );
  });
});
