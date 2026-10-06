import { CalendarService } from '#server/calendar/calendar.service.js';
import type { CalendarMeetingPresenterService } from '#server/calendar/calendar-meeting-presenter.service.js';
import { CalendarMeetingCanceledError } from '#server/calendar/domain/calendar.error.js';
import type { Meeting } from '#server/calendar/domain/meeting.js';
import type { MeetingRoom } from '#server/calendar/domain/meeting-room.js';
import { UpdateMeetingSchema } from '#server/calendar/dto/update-meeting.dto.js';
import { CalendarRepository } from '#server/calendar/infrastructure/persistence/calendar.repository.js';
import { CalendarProjectReferenceProvider } from '#server/calendar/infrastructure/project/calendar-project-reference.provider.js';
import { CalendarReminderScheduler } from '#server/calendar/infrastructure/reminder/calendar-reminder-scheduler.provider.js';
import { OrganizationAccessDeniedError } from '#server/organizations/domain/organization.error.js';
import type { OrganizationActorContext } from '#server/organizations/organization-actor-context.js';
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

class FakeProjectReferenceProvider extends CalendarProjectReferenceProvider {
  assertReference =
    jest.fn<CalendarProjectReferenceProvider['assertReference']>();
  listSummaries = jest.fn<CalendarProjectReferenceProvider['listSummaries']>();
}

class FakeOrganizationsService {
  getDetail = jest.fn<OrganizationsService['getDetail']>();
  searchMemberUserIds = jest.fn<OrganizationsService['searchMemberUserIds']>();
  assertAdministrativeAccess =
    jest.fn<OrganizationsService['assertAdministrativeAccess']>();
}

class FakePresenter {
  presentList = jest.fn<CalendarMeetingPresenterService['presentList']>();
  presentDetail = jest.fn<CalendarMeetingPresenterService['presentDetail']>();
}

class FakeReminderScheduler extends CalendarReminderScheduler {
  sync = jest.fn<CalendarReminderScheduler['sync']>();
  cancel = jest.fn<CalendarReminderScheduler['cancel']>();
}

const context: OrganizationActorContext = {
  userId: 'organizer-user',
  activeOrganizationIdCandidate: 'organization-a',
  providerCredential: {},
};

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
    iCalUid: '00000000-0000-4000-8000-000000000099',
    iCalSequence: 0,
    recurrenceSeriesId: null,
    recurrenceOriginalStartAt: null,
    createdAt: new Date('2026-10-06T00:00:00.000Z'),
    updatedAt: new Date('2026-10-06T00:00:00.000Z'),
    canceledAt: null,
    canceledByUserId: null,
    cancelReason: null,
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

function record(overrides: Partial<Meeting> = {}) {
  return {
    meeting: meeting(overrides),
    meetingRoom: overrides.meetingRoomId ? room() : null,
    recurrence: null,
    attendees: [],
  };
}

describe('캘린더 기본 서비스', () => {
  let repository: FakeCalendarRepository;
  let presenter: FakePresenter;
  let projectProvider: FakeProjectReferenceProvider;
  let reminderScheduler: FakeReminderScheduler;
  let organizationsService: FakeOrganizationsService;
  let service: CalendarService;

  beforeEach(() => {
    repository = new FakeCalendarRepository();
    presenter = new FakePresenter();
    projectProvider = new FakeProjectReferenceProvider();
    reminderScheduler = new FakeReminderScheduler();
    organizationsService = new FakeOrganizationsService();
    service = new CalendarService(
      repository,
      presenter,
      projectProvider,
      reminderScheduler,
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
  });

  test('주최자가 아닌 사용자의 기본 수정은 조직 관리 권한 경계를 통과해야 한다', async () => {
    repository.findMeetingById.mockResolvedValue(
      record({ organizerUserId: 'another-organizer' }),
    );
    organizationsService.assertAdministrativeAccess.mockRejectedValue(
      new OrganizationAccessDeniedError(),
    );

    await expect(
      service.updateMeeting(context, 'organization-a', meeting().id, {
        title: '수정된 제목',
      }),
    ).rejects.toBeInstanceOf(OrganizationAccessDeniedError);
    expect(repository.editMeetingDetails).not.toHaveBeenCalled();
  });

  test('동일한 일반 필드 PATCH는 저장이나 reminder 재예약을 하지 않는다', async () => {
    const current = record({ reminderMinutes: 15 });
    repository.findMeetingById.mockResolvedValue(current);
    presenter.presentDetail.mockResolvedValue({} as never);

    await service.updateMeeting(context, 'organization-a', current.meeting.id, {
      title: current.meeting.title,
      category: current.meeting.category,
      projectId: current.meeting.projectId,
      reminderMinutes: current.meeting.reminderMinutes,
    });

    expect(repository.editMeetingDetails).not.toHaveBeenCalled();
    expect(reminderScheduler.sync).not.toHaveBeenCalled();
  });

  test('기본 Meeting PATCH는 장소와 회의실 변경을 받지 않는다', () => {
    const result = UpdateMeetingSchema.safeParse({ locationType: 'online' });

    expect(result.success).toBe(false);
  });

  test('agenda 수정은 narrow repository capability만 사용한다', async () => {
    const current = record();
    repository.findMeetingById.mockResolvedValue(current);
    repository.updateMeetingAgenda.mockResolvedValue(current);
    presenter.presentDetail.mockResolvedValue({} as never);

    await service.updateAgenda(context, 'organization-a', current.meeting.id, {
      agendaMarkdown: '# 논의',
    });

    expect(repository.updateMeetingAgenda).toHaveBeenCalledWith(
      'organization-a',
      current.meeting.id,
      '# 논의',
    );
    expect(repository.editMeetingDetails).not.toHaveBeenCalled();
  });

  test('notes 수정은 scheduling mutation과 분리된 narrow capability를 사용한다', async () => {
    const current = record();
    repository.findMeetingById.mockResolvedValue(current);
    repository.updateMeetingNotes.mockResolvedValue(current);
    presenter.presentDetail.mockResolvedValue({} as never);

    await service.updateNotes(context, 'organization-a', current.meeting.id, {
      notesMarkdown: '결정사항',
    });

    expect(repository.updateMeetingNotes).toHaveBeenCalledWith(
      'organization-a',
      current.meeting.id,
      '결정사항',
    );
  });

  test('취소된 Meeting은 notes를 수정할 수 없다', async () => {
    const current = record({
      canceledAt: new Date('2026-10-06T01:00:00.000Z'),
      canceledByUserId: 'organizer-user',
    });
    repository.findMeetingById.mockResolvedValue(current);

    await expect(
      service.updateNotes(context, 'organization-a', current.meeting.id, {
        notesMarkdown: '수정하면 안 됨',
      }),
    ).rejects.toBeInstanceOf(CalendarMeetingCanceledError);
    expect(repository.updateMeetingNotes).not.toHaveBeenCalled();
  });
});
