import { CalendarMeetingContentService } from '@/calendar/calendar-meeting-content.service';
import { CalendarMeetingLoader } from '@/calendar/calendar-meeting.loader';
import { CalendarMeetingPolicy } from '@/calendar/calendar-meeting.policy';
import type { CalendarMeetingPresenterService } from '@/calendar/calendar-meeting-presenter.service';
import { CalendarMeetingCanceledError } from '@/calendar/domain/calendar.error';
import type { Meeting } from '@/calendar/domain/meeting';
import { UpdateMeetingSchema } from '@/calendar/dto/update-meeting.dto';
import type { CalendarMeetingDetailRecord } from '@/calendar/infrastructure/persistence/calendar-meeting-query.repository';
import { MeetingContentRepository } from '@/calendar/infrastructure/persistence/meeting-content.repository';
import { CalendarProjectReferenceProvider } from '@/calendar/infrastructure/project/calendar-project-reference.provider';
import { CalendarReminderScheduler } from '@/calendar/infrastructure/reminder/calendar-reminder-scheduler.provider';
import { createMeetingDetailResponseFixture } from '@/calendar/testing/meeting-detail.fixture';
import { OrganizationAccessDeniedError } from '@/organizations/domain/organization.error';
import type { OrganizationActorContext } from '@/organizations/organization-actor-context';
import type { OrganizationsService } from '@/organizations/organizations.service';

import { jest } from '@jest/globals';

class FakeMeetingContentRepository extends MeetingContentRepository {
  editMeetingDetails =
    jest.fn<MeetingContentRepository['editMeetingDetails']>();
  updateMeetingAgenda =
    jest.fn<MeetingContentRepository['updateMeetingAgenda']>();
  updateMeetingNotes =
    jest.fn<MeetingContentRepository['updateMeetingNotes']>();
}

class FakeMeetingLoader {
  requireMeeting = jest.fn<CalendarMeetingLoader['requireMeeting']>();
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

function record(overrides: Partial<Meeting> = {}): CalendarMeetingDetailRecord {
  return {
    meeting: meeting(overrides),
    meetingRoom: null,
    recurrence: null,
    attendees: [],
  };
}

describe('캘린더 회의 content 서비스', () => {
  let contentRepository: FakeMeetingContentRepository;
  let meetingLoader: FakeMeetingLoader;
  let presenter: FakePresenter;
  let projectProvider: FakeProjectReferenceProvider;
  let reminderScheduler: FakeReminderScheduler;
  let organizationsService: FakeOrganizationsService;
  let service: CalendarMeetingContentService;

  beforeEach(() => {
    contentRepository = new FakeMeetingContentRepository();
    meetingLoader = new FakeMeetingLoader();
    presenter = new FakePresenter();
    projectProvider = new FakeProjectReferenceProvider();
    reminderScheduler = new FakeReminderScheduler();
    organizationsService = new FakeOrganizationsService();
    service = new CalendarMeetingContentService(
      contentRepository,
      meetingLoader,
      new CalendarMeetingPolicy(organizationsService),
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
    meetingLoader.requireMeeting.mockResolvedValue(
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
    expect(contentRepository.editMeetingDetails).not.toHaveBeenCalled();
  });

  test('동일한 일반 필드 PATCH는 저장이나 reminder 재예약을 하지 않는다', async () => {
    const current = record({ reminderMinutes: 15 });
    meetingLoader.requireMeeting.mockResolvedValue(current);
    presenter.presentDetail.mockResolvedValue(
      createMeetingDetailResponseFixture(),
    );

    await service.updateMeeting(context, 'organization-a', current.meeting.id, {
      title: current.meeting.title,
      category: current.meeting.category,
      projectId: current.meeting.projectId,
      reminderMinutes: current.meeting.reminderMinutes,
    });

    expect(contentRepository.editMeetingDetails).not.toHaveBeenCalled();
    expect(reminderScheduler.sync).not.toHaveBeenCalled();
  });

  test('기본 Meeting PATCH는 장소와 회의실 변경을 받지 않는다', () => {
    const result = UpdateMeetingSchema.safeParse({ locationType: 'online' });

    expect(result.success).toBe(false);
  });

  test('agenda 수정은 narrow repository capability만 사용한다', async () => {
    const current = record();
    meetingLoader.requireMeeting.mockResolvedValue(current);
    contentRepository.updateMeetingAgenda.mockResolvedValue(current);
    presenter.presentDetail.mockResolvedValue(
      createMeetingDetailResponseFixture(),
    );

    await service.updateAgenda(context, 'organization-a', current.meeting.id, {
      agendaMarkdown: '# 논의',
    });

    expect(contentRepository.updateMeetingAgenda).toHaveBeenCalledWith(
      'organization-a',
      current.meeting.id,
      { agendaMarkdown: '# 논의' },
    );
    expect(contentRepository.editMeetingDetails).not.toHaveBeenCalled();
  });

  test('notes 수정은 scheduling mutation과 분리된 narrow capability를 사용한다', async () => {
    const current = record();
    meetingLoader.requireMeeting.mockResolvedValue(current);
    contentRepository.updateMeetingNotes.mockResolvedValue(current);
    presenter.presentDetail.mockResolvedValue(
      createMeetingDetailResponseFixture(),
    );

    await service.updateNotes(context, 'organization-a', current.meeting.id, {
      notesMarkdown: '결정사항',
    });

    expect(contentRepository.updateMeetingNotes).toHaveBeenCalledWith(
      'organization-a',
      current.meeting.id,
      { notesMarkdown: '결정사항' },
    );
  });

  test('취소된 Meeting은 notes를 수정할 수 없다', async () => {
    const current = record({
      canceledAt: new Date('2026-10-06T01:00:00.000Z'),
      canceledByUserId: 'organizer-user',
    });
    meetingLoader.requireMeeting.mockResolvedValue(current);

    await expect(
      service.updateNotes(context, 'organization-a', current.meeting.id, {
        notesMarkdown: '수정하면 안 됨',
      }),
    ).rejects.toBeInstanceOf(CalendarMeetingCanceledError);
    expect(contentRepository.updateMeetingNotes).not.toHaveBeenCalled();
  });
});
