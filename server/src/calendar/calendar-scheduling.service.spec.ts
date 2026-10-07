import { CalendarAvailabilityService } from '@/calendar/calendar-availability.service';
import { CalendarMeetingLoader } from '@/calendar/calendar-meeting.loader';
import { CalendarMeetingPolicy } from '@/calendar/calendar-meeting.policy';
import type { CalendarMeetingPresenterService } from '@/calendar/calendar-meeting-presenter.service';
import { CalendarParticipantPolicy } from '@/calendar/calendar-participant.policy';
import { CalendarParticipationService } from '@/calendar/calendar-participation.service';
import { CalendarRecurrenceService } from '@/calendar/calendar-recurrence.service';
import { CalendarSchedulingConflictPolicy } from '@/calendar/calendar-scheduling-conflict.policy';
import { CalendarSchedulingService } from '@/calendar/calendar-scheduling.service';
import {
  CalendarMeetingAlreadyCanceledError,
  CalendarParticipantConflictError,
} from '@/calendar/domain/calendar.error';
import type { Meeting } from '@/calendar/domain/meeting';
import type { MeetingAttendee } from '@/calendar/domain/meeting-attendee';
import type { MeetingRecurrenceSeries } from '@/calendar/domain/meeting-recurrence-series';
import { CalendarAvailabilityRepository } from '@/calendar/infrastructure/persistence/calendar-availability.repository';
import { CalendarMeetingQueryRepository } from '@/calendar/infrastructure/persistence/calendar-meeting-query.repository';
import { CalendarSchedulingRepository } from '@/calendar/infrastructure/persistence/calendar-scheduling.repository';
import { MeetingParticipationRepository } from '@/calendar/infrastructure/persistence/meeting-participation.repository';
import { MeetingRoomRepository } from '@/calendar/infrastructure/persistence/meeting-room.repository';
import { CalendarProjectReferenceProvider } from '@/calendar/infrastructure/project/calendar-project-reference.provider';
import { CalendarReminderScheduler } from '@/calendar/infrastructure/reminder/calendar-reminder-scheduler.provider';
import { RecurrenceSchedulingPlanService } from '@/calendar/recurrence-scheduling-plan.service';
import { createMeetingDetailResponseFixture } from '@/calendar/testing/meeting-detail.fixture';
import type { OrganizationMember } from '@/organizations/domain/organization-member';
import type { OrganizationActorContext } from '@/organizations/organization-actor-context';
import type { OrganizationsService } from '@/organizations/organizations.service';

import { jest } from '@jest/globals';

class FakeMeetingQueryRepository extends CalendarMeetingQueryRepository {
  listMeetingsInRange =
    jest.fn<CalendarMeetingQueryRepository['listMeetingsInRange']>();
  findMeetingById =
    jest.fn<CalendarMeetingQueryRepository['findMeetingById']>();
  listMeetingsInSeries =
    jest.fn<CalendarMeetingQueryRepository['listMeetingsInSeries']>();
}

class FakeAvailabilityRepository extends CalendarAvailabilityRepository {
  findParticipantBusyIntervals =
    jest.fn<CalendarAvailabilityRepository['findParticipantBusyIntervals']>();
  findRoomBusyIntervals =
    jest.fn<CalendarAvailabilityRepository['findRoomBusyIntervals']>();
}

class FakeSchedulingRepository extends CalendarSchedulingRepository {
  scheduleMeeting = jest.fn<CalendarSchedulingRepository['scheduleMeeting']>();
  rescheduleMeetings =
    jest.fn<CalendarSchedulingRepository['rescheduleMeetings']>();
  cancelMeetings = jest.fn<CalendarSchedulingRepository['cancelMeetings']>();
}

class FakeParticipationRepository extends MeetingParticipationRepository {
  replaceMeetingAttendees =
    jest.fn<MeetingParticipationRepository['replaceMeetingAttendees']>();
  updateAttendeeRsvp =
    jest.fn<MeetingParticipationRepository['updateAttendeeRsvp']>();
}

class FakeMeetingRoomRepository extends MeetingRoomRepository {
  listMeetingRooms = jest.fn<MeetingRoomRepository['listMeetingRooms']>();
  findMeetingRoomById = jest.fn<MeetingRoomRepository['findMeetingRoomById']>();
  createMeetingRoom = jest.fn<MeetingRoomRepository['createMeetingRoom']>();
  updateMeetingRoom = jest.fn<MeetingRoomRepository['updateMeetingRoom']>();
}

class FakeProjectReferenceProvider extends CalendarProjectReferenceProvider {
  assertReference =
    jest.fn<CalendarProjectReferenceProvider['assertReference']>();
  listSummaries = jest.fn<CalendarProjectReferenceProvider['listSummaries']>();
}

class FakeReminderScheduler extends CalendarReminderScheduler {
  sync = jest.fn<CalendarReminderScheduler['sync']>();
  cancel = jest.fn<CalendarReminderScheduler['cancel']>();
}

class FakeOrganizationsService {
  getDetail = jest.fn<OrganizationsService['getDetail']>();
  listMembersByUserIds =
    jest.fn<OrganizationsService['listMembersByUserIds']>();
  assertAdministrativeAccess =
    jest.fn<OrganizationsService['assertAdministrativeAccess']>();
}

class FakePresenter {
  presentDetail = jest.fn<CalendarMeetingPresenterService['presentDetail']>();
}

const context: OrganizationActorContext = {
  userId: 'organizer-user',
  activeOrganizationIdCandidate: 'organization-a',
};

function member(userId: OrganizationMember['userId']): OrganizationMember {
  return {
    id: `member-${userId}`,
    organizationId: 'organization-a',
    userId,
    role: 'member',
    createdAt: new Date(0).toISOString(),
    user: {
      id: userId,
      name: userId,
      email: `${userId}@example.com`,
      image: null,
    },
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

function attendee(
  userId: MeetingAttendee['userId'],
  status: MeetingAttendee['status'] = 'pending',
): MeetingAttendee {
  return {
    meetingId: meeting().id,
    userId,
    status,
    createdAt: new Date('2026-10-06T00:00:00.000Z'),
    updatedAt: new Date('2026-10-06T00:00:00.000Z'),
  };
}

function recurrence(
  overrides: Partial<MeetingRecurrenceSeries> = {},
): MeetingRecurrenceSeries {
  return {
    id: '00000000-0000-4000-8000-000000000050',
    organizationId: 'organization-a',
    frequency: 'weekly',
    interval: 1,
    count: 3,
    until: null,
    byWeekday: ['WE'],
    timeZone: 'Asia/Seoul',
    createdAt: new Date('2026-10-06T00:00:00.000Z'),
    updatedAt: new Date('2026-10-06T00:00:00.000Z'),
    ...overrides,
  };
}

function record(
  meetingOverrides: Partial<Meeting> = {},
  attendees: MeetingAttendee[] = [],
  series: MeetingRecurrenceSeries | null = null,
) {
  return {
    meeting: meeting(meetingOverrides),
    meetingRoom: null,
    recurrence: series,
    attendees,
  };
}

function recurringRecord(index: number) {
  const startAt = new Date(
    new Date('2026-10-07T00:00:00.000Z').getTime() + index * 7 * 86_400_000,
  );
  return record(
    {
      id: `00000000-0000-4000-8000-00000000000${index + 1}`,
      startAt,
      endAt: new Date(startAt.getTime() + 3_600_000),
      recurrenceSeriesId: recurrence().id,
      recurrenceOriginalStartAt: startAt,
    },
    [attendee('existing-user', 'accepted')],
    recurrence(),
  );
}

describe('캘린더 scheduling 서비스', () => {
  let meetingQueryRepository: FakeMeetingQueryRepository;
  let availabilityRepository: FakeAvailabilityRepository;
  let schedulingRepository: FakeSchedulingRepository;
  let participationRepository: FakeParticipationRepository;
  let meetingRoomRepository: FakeMeetingRoomRepository;
  let presenter: FakePresenter;
  let projectProvider: FakeProjectReferenceProvider;
  let reminderScheduler: FakeReminderScheduler;
  let organizationsService: FakeOrganizationsService;
  let availabilityService: CalendarAvailabilityService;
  let participationService: CalendarParticipationService;
  let service: CalendarSchedulingService;

  beforeEach(() => {
    meetingQueryRepository = new FakeMeetingQueryRepository();
    availabilityRepository = new FakeAvailabilityRepository();
    schedulingRepository = new FakeSchedulingRepository();
    participationRepository = new FakeParticipationRepository();
    meetingRoomRepository = new FakeMeetingRoomRepository();
    presenter = new FakePresenter();
    projectProvider = new FakeProjectReferenceProvider();
    reminderScheduler = new FakeReminderScheduler();
    organizationsService = new FakeOrganizationsService();
    const meetingLoader = new CalendarMeetingLoader(
      meetingQueryRepository,
      meetingRoomRepository,
    );
    const meetingPolicy = new CalendarMeetingPolicy(organizationsService);
    const participantPolicy = new CalendarParticipantPolicy(
      organizationsService,
    );
    const conflictPolicy = new CalendarSchedulingConflictPolicy();
    const recurrenceService = new CalendarRecurrenceService();
    const recurrencePlanService = new RecurrenceSchedulingPlanService(
      meetingQueryRepository,
      recurrenceService,
    );
    availabilityService = new CalendarAvailabilityService(
      availabilityRepository,
      meetingLoader,
      meetingPolicy,
      participantPolicy,
      organizationsService,
    );
    participationService = new CalendarParticipationService(
      participationRepository,
      meetingLoader,
      meetingPolicy,
      presenter,
      participantPolicy,
      conflictPolicy,
      organizationsService,
    );
    service = new CalendarSchedulingService(
      schedulingRepository,
      meetingLoader,
      meetingPolicy,
      presenter,
      recurrenceService,
      recurrencePlanService,
      participantPolicy,
      conflictPolicy,
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
    organizationsService.listMembersByUserIds.mockImplementation(
      async (_context, _organizationId, userIds) =>
        userIds.map((userId) => member(userId)),
    );
    organizationsService.assertAdministrativeAccess.mockResolvedValue();
    presenter.presentDetail.mockResolvedValue(
      createMeetingDetailResponseFixture(),
    );
  });

  test('authoritative create에서 participant conflict가 생기면 hard block한다', async () => {
    schedulingRepository.scheduleMeeting.mockResolvedValue({
      status: 'conflict',
      participantConflicts: [
        {
          meetingId: '00000000-0000-4000-8000-000000000010',
          userId: 'organizer-user',
          startAt: new Date('2026-10-07T00:30:00.000Z'),
          endAt: new Date('2026-10-07T01:30:00.000Z'),
          sourceType: 'organizer',
        },
      ],
      roomConflict: null,
    });

    await expect(
      service.createMeeting(context, 'organization-a', {
        title: '충돌 회의',
        category: 'team',
        startAt: '2026-10-07T09:00:00+09:00',
        endAt: '2026-10-07T10:00:00+09:00',
        timeZone: 'Asia/Seoul',
        locationType: 'online',
        attendeeUserIds: [],
      }),
    ).rejects.toBeInstanceOf(CalendarParticipantConflictError);
    expect(reminderScheduler.sync).not.toHaveBeenCalled();
  });

  test('Meeting 생성 성공 후 저장된 Meeting으로 reminder를 동기화한다', async () => {
    const created = record({ reminderMinutes: 15 });
    schedulingRepository.scheduleMeeting.mockResolvedValue({
      status: 'scheduled',
      records: [created],
    });

    await service.createMeeting(context, 'organization-a', {
      title: created.meeting.title,
      category: created.meeting.category,
      startAt: created.meeting.startAt.toISOString(),
      endAt: created.meeting.endAt.toISOString(),
      timeZone: created.meeting.timeZone,
      locationType: 'online',
      attendeeUserIds: [],
      reminderMinutes: 15,
    });

    expect(reminderScheduler.sync).toHaveBeenCalledWith([created.meeting]);
  });

  test('availability response에는 다른 Meeting 식별자나 제목을 노출하지 않는다', async () => {
    availabilityRepository.findParticipantBusyIntervals.mockResolvedValue([
      {
        meetingId: '00000000-0000-4000-8000-000000000010',
        userId: 'attendee-user',
        startAt: new Date('2026-10-07T00:30:00.000Z'),
        endAt: new Date('2026-10-07T01:30:00.000Z'),
        sourceType: 'attendee',
      },
    ]);
    availabilityRepository.findRoomBusyIntervals.mockResolvedValue([]);

    const result = await availabilityService.previewAvailability(
      context,
      'organization-a',
      {
        startAt: '2026-10-07T09:00:00+09:00',
        endAt: '2026-10-07T10:00:00+09:00',
        timeZone: 'Asia/Seoul',
        attendeeUserIds: ['attendee-user'],
        meetingRoomId: null,
      },
    );

    expect(result.available).toBe(false);
    expect(result.participantConflicts).toEqual([
      {
        userId: 'attendee-user',
        startAt: '2026-10-07T00:30:00.000Z',
        endAt: '2026-10-07T01:30:00.000Z',
        sourceType: 'attendee',
      },
    ]);
    expect(result.participantConflicts[0]).not.toHaveProperty('meetingId');
  });

  test('reschedule availability는 client attendee 입력 대신 현재 RSVP 상태를 사용한다', async () => {
    const current = record({}, [
      attendee('accepted-user', 'accepted'),
      attendee('declined-user', 'declined'),
    ]);
    meetingQueryRepository.findMeetingById.mockResolvedValue(current);
    availabilityRepository.findParticipantBusyIntervals.mockResolvedValue([]);
    availabilityRepository.findRoomBusyIntervals.mockResolvedValue([]);

    await availabilityService.previewRescheduleAvailability(
      context,
      'organization-a',
      current.meeting.id,
      {
        startAt: '2026-10-08T09:00:00+09:00',
        endAt: '2026-10-08T10:00:00+09:00',
        timeZone: 'Asia/Seoul',
        meetingRoomId: null,
      },
    );

    expect(
      availabilityRepository.findParticipantBusyIntervals,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        userIds: ['organizer-user', 'accepted-user'],
        excludeMeetingIds: [current.meeting.id],
      }),
    );
  });

  test('동일한 attendee set 재저장은 repository mutation을 생략한다', async () => {
    const current = record({}, [attendee('existing-user', 'accepted')]);
    meetingQueryRepository.findMeetingById.mockResolvedValue(current);
    presenter.presentDetail.mockResolvedValue(
      createMeetingDetailResponseFixture(),
    );

    await participationService.replaceAttendees(
      context,
      'organization-a',
      current.meeting.id,
      { attendeeUserIds: ['existing-user', 'organizer-user'] },
    );

    expect(
      participationRepository.replaceMeetingAttendees,
    ).not.toHaveBeenCalled();
  });

  test('attendee replace는 새로 추가된 사용자만 conflict 대상으로 넘긴다', async () => {
    const current = record({}, [attendee('existing-user', 'accepted')]);
    meetingQueryRepository.findMeetingById.mockResolvedValue(current);
    participationRepository.replaceMeetingAttendees.mockResolvedValue({
      status: 'updated',
      record: current,
    });

    await participationService.replaceAttendees(
      context,
      'organization-a',
      current.meeting.id,
      {
        attendeeUserIds: ['existing-user', 'new-user'],
      },
    );

    expect(
      participationRepository.replaceMeetingAttendees,
    ).toHaveBeenCalledWith(
      'organization-a',
      current.meeting.id,
      { attendeeUserIds: ['existing-user', 'new-user'] },
      ['new-user'],
    );
  });

  test('RSVP는 request userId 없이 현재 actor attendee row만 변경한다', async () => {
    const current = record({}, [attendee('organizer-user')]);
    meetingQueryRepository.findMeetingById.mockResolvedValue(current);
    participationRepository.updateAttendeeRsvp.mockResolvedValue({
      status: 'updated',
      attendee: attendee('organizer-user', 'accepted'),
    });

    await participationService.updateRsvp(
      context,
      'organization-a',
      current.meeting.id,
      {
        status: 'accepted',
      },
    );

    expect(participationRepository.updateAttendeeRsvp).toHaveBeenCalledWith(
      'organization-a',
      current.meeting.id,
      'organizer-user',
      { status: 'accepted' },
    );
  });

  test('declined 이후 RSVP를 다시 수락할 때 기존 일정과 겹치면 hard block한다', async () => {
    const current = record({}, [attendee('organizer-user', 'declined')]);
    meetingQueryRepository.findMeetingById.mockResolvedValue(current);
    participationRepository.updateAttendeeRsvp.mockResolvedValue({
      status: 'conflict',
      participantConflicts: [
        {
          meetingId: '00000000-0000-4000-8000-000000000010',
          userId: 'organizer-user',
          startAt: new Date('2026-10-07T00:30:00.000Z'),
          endAt: new Date('2026-10-07T01:30:00.000Z'),
          sourceType: 'attendee',
        },
      ],
      roomConflict: null,
    });

    await expect(
      participationService.updateRsvp(
        context,
        'organization-a',
        current.meeting.id,
        {
          status: 'accepted',
        },
      ),
    ).rejects.toBeInstanceOf(CalendarParticipantConflictError);
  });

  test('single reschedule 성공 후 변경된 Meeting reminder를 다시 동기화한다', async () => {
    const current = record({ reminderMinutes: 10 });
    const updated = record({
      ...current.meeting,
      startAt: new Date('2026-10-08T00:00:00.000Z'),
      endAt: new Date('2026-10-08T01:00:00.000Z'),
      reminderMinutes: 10,
    });
    meetingQueryRepository.findMeetingById.mockResolvedValue(current);
    schedulingRepository.rescheduleMeetings.mockResolvedValue({
      status: 'updated',
      records: [updated],
    });

    await service.rescheduleMeeting(
      context,
      'organization-a',
      current.meeting.id,
      {
        startAt: updated.meeting.startAt.toISOString(),
        endAt: updated.meeting.endAt.toISOString(),
        timeZone: 'Asia/Seoul',
        locationType: 'online',
        meetingRoomId: null,
        locationText: null,
        scope: 'single',
      },
    );

    expect(reminderScheduler.sync).toHaveBeenCalledWith([updated.meeting]);
  });

  test('Meeting 취소 성공 후 해당 reminder job을 취소한다', async () => {
    const current = record({ reminderMinutes: 10 });
    const canceled = record({
      ...current.meeting,
      canceledAt: new Date('2026-10-06T01:00:00.000Z'),
      canceledByUserId: 'organizer-user',
      reminderMinutes: 10,
    });
    meetingQueryRepository.findMeetingById.mockResolvedValue(current);
    schedulingRepository.cancelMeetings.mockResolvedValue([canceled]);

    await service.cancelMeeting(context, 'organization-a', current.meeting.id, {
      reason: null,
      scope: 'single',
    });

    expect(reminderScheduler.cancel).toHaveBeenCalledWith([current.meeting.id]);
  });

  test('이미 취소된 Meeting을 다시 취소하지 않는다', async () => {
    const current = record({
      canceledAt: new Date('2026-10-06T01:00:00.000Z'),
      canceledByUserId: 'organizer-user',
    });
    meetingQueryRepository.findMeetingById.mockResolvedValue(current);

    await expect(
      service.cancelMeeting(context, 'organization-a', current.meeting.id, {
        reason: null,
        scope: 'single',
      }),
    ).rejects.toBeInstanceOf(CalendarMeetingAlreadyCanceledError);
    expect(schedulingRepository.cancelMeetings).not.toHaveBeenCalled();
  });

  test('future reschedule은 과거 series를 닫고 미래 occurrence를 새 series로 분리한다', async () => {
    const series = [recurringRecord(0), recurringRecord(1), recurringRecord(2)];
    const selected = series[1]!;
    meetingQueryRepository.findMeetingById.mockResolvedValue(selected);
    meetingQueryRepository.listMeetingsInSeries.mockResolvedValue(series);
    schedulingRepository.rescheduleMeetings.mockImplementation(
      async (_organizationId, _input, updates) => ({
        status: 'updated',
        records: updates.map((update) => {
          const original = series.find(
            (item) => item.meeting.id === update.id,
          )!;
          return record(
            {
              ...original.meeting,
              startAt: update.startAt,
              endAt: update.endAt,
            },
            original.attendees,
            original.recurrence,
          );
        }),
      }),
    );

    await service.rescheduleMeeting(
      context,
      'organization-a',
      selected.meeting.id,
      {
        startAt: '2026-10-15T10:00:00+09:00',
        endAt: '2026-10-15T11:00:00+09:00',
        timeZone: 'Asia/Seoul',
        locationType: 'online',
        meetingRoomId: null,
        locationText: null,
        scope: 'future',
      },
    );

    const call = schedulingRepository.rescheduleMeetings.mock.calls[0];
    const updates = call?.[2];
    const recurrenceMutation = call?.[4];
    expect(updates).toHaveLength(2);
    expect(
      updates?.every(
        (update) => update.recurrenceOriginalStartAt instanceof Date,
      ),
    ).toBe(true);
    expect(recurrenceMutation).toMatchObject({
      kind: 'split',
      sourceSeriesId: recurrence().id,
      sourceChanges: {
        count: null,
        until: series[0]!.meeting.recurrenceOriginalStartAt,
      },
      meetingIds: [series[1]!.meeting.id, series[2]!.meeting.id],
      create: {
        frequency: 'weekly',
        interval: 1,
        count: 2,
        until: null,
        byWeekday: ['TH'],
        timeZone: 'Asia/Seoul',
      },
    });
  });

  test('series reschedule은 기존 recurrence series의 규칙과 occurrence identity를 함께 갱신한다', async () => {
    const series = [recurringRecord(0), recurringRecord(1), recurringRecord(2)];
    const selected = series[0]!;
    meetingQueryRepository.findMeetingById.mockResolvedValue(selected);
    meetingQueryRepository.listMeetingsInSeries.mockResolvedValue(series);
    schedulingRepository.rescheduleMeetings.mockImplementation(
      async (_organizationId, _input, updates) => ({
        status: 'updated',
        records: updates.map((update) => {
          const original = series.find(
            (item) => item.meeting.id === update.id,
          )!;
          return record(
            {
              ...original.meeting,
              startAt: update.startAt,
              endAt: update.endAt,
            },
            original.attendees,
            original.recurrence,
          );
        }),
      }),
    );

    await service.rescheduleMeeting(
      context,
      'organization-a',
      selected.meeting.id,
      {
        startAt: '2026-10-08T09:00:00+09:00',
        endAt: '2026-10-08T10:00:00+09:00',
        timeZone: 'Asia/Seoul',
        locationType: 'online',
        meetingRoomId: null,
        locationText: null,
        scope: 'series',
      },
    );

    const call = schedulingRepository.rescheduleMeetings.mock.calls[0];
    const updates = call?.[2];
    const recurrenceMutation = call?.[4];
    expect(recurrenceMutation).toMatchObject({
      kind: 'update',
      seriesId: recurrence().id,
      changes: {
        count: 3,
        until: null,
        byWeekday: ['TH'],
        timeZone: 'Asia/Seoul',
      },
    });
    expect(
      updates?.every(
        (update) => update.recurrenceOriginalStartAt instanceof Date,
      ),
    ).toBe(true);
  });
});
