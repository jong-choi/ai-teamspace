import { randomUUID } from 'node:crypto';

import { Test, type TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';

import {
  organization,
  user,
} from '@/auth/infrastructure/persistence/drizzle/generated/auth.schema';
import type { Meeting } from '@/calendar/domain/meeting';
import {
  CreateMeetingSchema,
  type CreateMeetingInput,
} from '@/calendar/dto/create-meeting.dto';
import type { RescheduleMeetingInput } from '@/calendar/dto/reschedule-meeting.dto';
import { CalendarMeetingQueryRepository } from '@/calendar/infrastructure/persistence/calendar-meeting-query.repository';
import { CalendarSchedulingRepository } from '@/calendar/infrastructure/persistence/calendar-scheduling.repository';
import { CalendarDrizzlePersistenceModule } from '@/calendar/infrastructure/persistence/drizzle/drizzle-persistence.module';
import { meeting } from '@/calendar/infrastructure/persistence/drizzle/schema/meeting.schema';
import { meetingRecurrenceSeries } from '@/calendar/infrastructure/persistence/drizzle/schema/meeting-recurrence-series.schema';
import { meetingRoom } from '@/calendar/infrastructure/persistence/drizzle/schema/meeting-room.schema';
import { MeetingParticipationRepository } from '@/calendar/infrastructure/persistence/meeting-participation.repository';
import { MeetingRoomRepository } from '@/calendar/infrastructure/persistence/meeting-room.repository';
import databaseConfig from '@/database/config/database.config';
import { DatabaseModule } from '@/database/database.module';
import { DatabaseService } from '@/database/database.service';

import { eq, inArray } from 'drizzle-orm';

const organizationId = 'calendar-repository-integration-org';
const organizerA = 'calendar-repository-organizer-a';
const organizerB = 'calendar-repository-organizer-b';
const userIds = [organizerA, organizerB] as const;
const startAt = new Date('2026-10-07T00:00:00.000Z');
const endAt = new Date('2026-10-07T01:00:00.000Z');

function scheduleInput(
  organizerUserId: Meeting['organizerUserId'],
  input: Partial<CreateMeetingInput> = {},
  occurrences?: Parameters<CalendarSchedulingRepository['scheduleMeeting']>[4],
  recurrence: Parameters<
    CalendarSchedulingRepository['scheduleMeeting']
  >[5] = null,
): Parameters<CalendarSchedulingRepository['scheduleMeeting']> {
  const meetingRoomId = input.meetingRoomId ?? null;
  const createInput = CreateMeetingSchema.parse({
    projectId: null,
    title: '통합 테스트 회의',
    category: 'team',
    startAt: (input.startAt ? new Date(input.startAt) : startAt).toISOString(),
    endAt: (input.endAt ? new Date(input.endAt) : endAt).toISOString(),
    timeZone: 'Asia/Seoul',
    locationType: meetingRoomId ? 'meeting_room' : 'online',
    meetingRoomId,
    locationText: null,
    agendaMarkdown: '',
    notesMarkdown: '',
    reminderMinutes: null,
    ...input,
  });

  return [
    organizationId,
    organizerUserId,
    createInput,
    createInput.attendeeUserIds,
    occurrences ?? [
      {
        startAt: new Date(createInput.startAt),
        endAt: new Date(createInput.endAt),
        recurrenceOriginalStartAt: null,
      },
    ],
    recurrence,
    randomUUID(),
  ];
}

function rescheduleInput(
  updates: readonly (Parameters<
    CalendarSchedulingRepository['rescheduleMeetings']
  >[2][number] &
    Pick<
      RescheduleMeetingInput,
      'timeZone' | 'locationType' | 'meetingRoomId' | 'locationText'
    >)[],
  recurrenceMutation?: Parameters<
    CalendarSchedulingRepository['rescheduleMeetings']
  >[4],
): Parameters<CalendarSchedulingRepository['rescheduleMeetings']> {
  const first = updates[0];
  if (!first) {
    throw new Error('reschedule 통합 테스트에는 update가 필요합니다.');
  }

  return [
    organizationId,
    {
      startAt: first.startAt.toISOString(),
      endAt: first.endAt.toISOString(),
      timeZone: first.timeZone,
      locationType: first.locationType,
      meetingRoomId: first.meetingRoomId,
      locationText: first.locationText,
      scope: 'single',
    },
    updates.map(({ id, startAt, endAt, recurrenceOriginalStartAt }) => ({
      id,
      startAt,
      endAt,
      ...(recurrenceOriginalStartAt === undefined
        ? {}
        : { recurrenceOriginalStartAt }),
    })),
    [],
    recurrenceMutation,
  ];
}

describe('캘린더 Drizzle scheduling 저장소 통합', () => {
  let moduleRef: TestingModule;
  let database: DatabaseService['db'];
  let schedulingRepository: CalendarSchedulingRepository;
  let queryRepository: CalendarMeetingQueryRepository;
  let participationRepository: MeetingParticipationRepository;
  let roomRepository: MeetingRoomRepository;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [databaseConfig],
        }),
        DatabaseModule,
        CalendarDrizzlePersistenceModule,
      ],
    }).compile();
    await moduleRef.init();
    database = moduleRef.get(DatabaseService).db;
    schedulingRepository = moduleRef.get(CalendarSchedulingRepository);
    queryRepository = moduleRef.get(CalendarMeetingQueryRepository);
    participationRepository = moduleRef.get(MeetingParticipationRepository);
    roomRepository = moduleRef.get(MeetingRoomRepository);
  });

  beforeEach(async () => {
    await cleanup();
    await database.insert(user).values([
      {
        id: organizerA,
        name: '캘린더 주최자 A',
        email: 'calendar-repository-a@example.com',
        username: 'calendarrepositorya',
      },
      {
        id: organizerB,
        name: '캘린더 주최자 B',
        email: 'calendar-repository-b@example.com',
        username: 'calendarrepositoryb',
      },
    ]);
    await database.insert(organization).values({
      id: organizationId,
      name: '캘린더 통합 조직',
      slug: 'calendar-repository-integration-org',
      createdAt: new Date(),
    });
  });

  afterAll(async () => {
    await cleanup();
    await moduleRef.close();
  });

  it('같은 participant의 겹치는 Meeting 동시 생성은 하나만 성공한다', async () => {
    const [first, second] = await Promise.all([
      schedulingRepository.scheduleMeeting(...scheduleInput(organizerA)),
      schedulingRepository.scheduleMeeting(...scheduleInput(organizerA)),
    ]);

    expect([first.status, second.status].sort()).toEqual([
      'conflict',
      'scheduled',
    ]);
  });

  it('같은 회의실의 겹치는 Meeting 동시 생성은 하나만 성공한다', async () => {
    const room = await roomRepository.createMeetingRoom(organizationId, {
      name: '통합 회의실',
      capacity: 8,
      floor: '3F',
      description: null,
    });

    const [first, second] = await Promise.all([
      schedulingRepository.scheduleMeeting(
        ...scheduleInput(organizerA, { meetingRoomId: room.id }),
      ),
      schedulingRepository.scheduleMeeting(
        ...scheduleInput(organizerB, { meetingRoomId: room.id }),
      ),
    ]);

    expect([first.status, second.status].sort()).toEqual([
      'conflict',
      'scheduled',
    ]);
  });

  it('비활성화된 회의실은 authoritative create transaction에서 다시 거부한다', async () => {
    const room = await roomRepository.createMeetingRoom(organizationId, {
      name: '비활성 회의실',
      capacity: 4,
      floor: null,
      description: null,
    });
    await roomRepository.updateMeetingRoom(organizationId, room.id, {
      active: false,
    });

    const result = await schedulingRepository.scheduleMeeting(
      ...scheduleInput(organizerA, { meetingRoomId: room.id }),
    );

    expect(result.status).toBe('room_unavailable');
  });

  it('끝 시각과 다음 시작 시각이 맞닿는 half-open interval은 충돌하지 않는다', async () => {
    const first = await schedulingRepository.scheduleMeeting(
      ...scheduleInput(organizerA),
    );
    const second = await schedulingRepository.scheduleMeeting(
      ...scheduleInput(organizerA, {
        startAt: endAt.toISOString(),
        endAt: '2026-10-07T02:00:00.000Z',
      }),
    );

    expect(first.status).toBe('scheduled');
    expect(second.status).toBe('scheduled');
  });

  it('reschedule과 새 Meeting이 같은 participant 시간대를 동시에 차지하지 못한다', async () => {
    const original = await schedulingRepository.scheduleMeeting(
      ...scheduleInput(organizerA),
    );
    if (original.status !== 'scheduled') {
      throw new Error('reschedule race 준비 Meeting을 생성하지 못했습니다.');
    }
    const originalMeeting = original.records[0]?.meeting;
    if (!originalMeeting) {
      throw new Error('reschedule race 준비 Meeting 결과가 없습니다.');
    }

    const [rescheduled, created] = await Promise.all([
      schedulingRepository.rescheduleMeetings(
        ...rescheduleInput([
          {
            id: originalMeeting.id,
            startAt: new Date('2026-10-07T02:00:00.000Z'),
            endAt: new Date('2026-10-07T03:00:00.000Z'),
            timeZone: 'Asia/Seoul',
            locationType: 'online',
            meetingRoomId: null,
            locationText: null,
          },
        ]),
      ),
      schedulingRepository.scheduleMeeting(
        ...scheduleInput(organizerA, {
          startAt: '2026-10-07T02:30:00.000Z',
          endAt: '2026-10-07T03:30:00.000Z',
        }),
      ),
    ]);

    expect(
      (rescheduled.status === 'updated' && created.status === 'conflict') ||
        (rescheduled.status === 'conflict' && created.status === 'scheduled'),
    ).toBe(true);
  });

  it('transaction 안에서 이미 취소된 Meeting은 reschedule하지 않는다', async () => {
    const original = await schedulingRepository.scheduleMeeting(
      ...scheduleInput(organizerA),
    );
    if (original.status !== 'scheduled') {
      throw new Error(
        '취소 reschedule 검증 준비 Meeting을 생성하지 못했습니다.',
      );
    }
    const originalMeeting = original.records[0]?.meeting;
    if (!originalMeeting) {
      throw new Error('취소 reschedule 검증 준비 Meeting 결과가 없습니다.');
    }
    await schedulingRepository.cancelMeetings(
      organizationId,
      [originalMeeting.id],
      organizerA,
      { reason: null, scope: 'single' },
    );

    const result = await schedulingRepository.rescheduleMeetings(
      ...rescheduleInput([
        {
          id: originalMeeting.id,
          startAt: new Date('2026-10-07T02:00:00.000Z'),
          endAt: new Date('2026-10-07T03:00:00.000Z'),
          timeZone: 'Asia/Seoul',
          locationType: 'online',
          meetingRoomId: null,
          locationText: null,
        },
      ]),
    );

    expect(result.status).toBe('canceled');
    const stored = await queryRepository.findMeetingById(
      organizationId,
      originalMeeting.id,
    );
    expect(stored?.meeting.startAt).toEqual(originalMeeting.startAt);
    expect(stored?.meeting.endAt).toEqual(originalMeeting.endAt);
  });

  it('Meeting 취소가 완료되면 같은 participant가 기존 slot을 다시 사용할 수 있다', async () => {
    const original = await schedulingRepository.scheduleMeeting(
      ...scheduleInput(organizerA),
    );
    if (original.status !== 'scheduled') {
      throw new Error('cancel slot 재사용 준비 Meeting을 생성하지 못했습니다.');
    }
    const originalMeeting = original.records[0]?.meeting;
    if (!originalMeeting) {
      throw new Error('cancel slot 재사용 준비 Meeting 결과가 없습니다.');
    }

    await schedulingRepository.cancelMeetings(
      organizationId,
      [originalMeeting.id],
      organizerA,
      { reason: null, scope: 'single' },
    );
    const replacement = await schedulingRepository.scheduleMeeting(
      ...scheduleInput(organizerA),
    );

    expect(replacement.status).toBe('scheduled');
  });

  it('attendee는 pending/accepted/tentative일 때 busy이고 declined일 때만 busy에서 빠진다', async () => {
    const original = await schedulingRepository.scheduleMeeting(
      ...scheduleInput(organizerA, { attendeeUserIds: [organizerB] }),
    );
    if (original.status !== 'scheduled') {
      throw new Error('attendee busy 준비 Meeting을 생성하지 못했습니다.');
    }
    const originalMeeting = original.records[0]?.meeting;
    if (!originalMeeting) {
      throw new Error('attendee busy 준비 Meeting 결과가 없습니다.');
    }

    const pendingConflict = await schedulingRepository.scheduleMeeting(
      ...scheduleInput(organizerB),
    );
    expect(pendingConflict.status).toBe('conflict');

    const accepted = await participationRepository.updateAttendeeRsvp(
      organizationId,
      originalMeeting.id,
      organizerB,
      { status: 'accepted' },
    );
    expect(accepted.status).toBe('updated');
    const acceptedConflict = await schedulingRepository.scheduleMeeting(
      ...scheduleInput(organizerB),
    );
    expect(acceptedConflict.status).toBe('conflict');

    const tentative = await participationRepository.updateAttendeeRsvp(
      organizationId,
      originalMeeting.id,
      organizerB,
      { status: 'tentative' },
    );
    expect(tentative.status).toBe('updated');
    const tentativeConflict = await schedulingRepository.scheduleMeeting(
      ...scheduleInput(organizerB),
    );
    expect(tentativeConflict.status).toBe('conflict');

    const declined = await participationRepository.updateAttendeeRsvp(
      organizationId,
      originalMeeting.id,
      organizerB,
      { status: 'declined' },
    );
    expect(declined.status).toBe('updated');
    const afterDecline = await schedulingRepository.scheduleMeeting(
      ...scheduleInput(organizerB),
    );
    expect(afterDecline.status).toBe('scheduled');
  });

  it('반복 일정의 후속 occurrence가 충돌하면 series를 부분 생성하지 않는다', async () => {
    const occupied = await schedulingRepository.scheduleMeeting(
      ...scheduleInput(organizerA, {
        startAt: '2026-10-14T00:00:00.000Z',
        endAt: '2026-10-14T01:00:00.000Z',
      }),
    );
    expect(occupied.status).toBe('scheduled');

    const result = await schedulingRepository.scheduleMeeting(
      ...scheduleInput(
        organizerA,
        {},
        [0, 7, 14].map((dayOffset) => {
          const occurrenceStart = new Date(
            startAt.getTime() + dayOffset * 86_400_000,
          );
          return {
            startAt: occurrenceStart,
            endAt: new Date(occurrenceStart.getTime() + 3_600_000),
            recurrenceOriginalStartAt: occurrenceStart,
          };
        }),
        {
          frequency: 'weekly',
          interval: 1,
          count: 3,
          until: null,
          byWeekday: ['WE'],
          timeZone: 'Asia/Seoul',
        },
      ),
    );

    expect(result.status).toBe('conflict');
    const meetings = await queryRepository.listMeetingsInRange({
      organizationId,
      from: new Date('2026-10-01T00:00:00.000Z'),
      to: new Date('2026-11-01T00:00:00.000Z'),
    });
    expect(meetings).toHaveLength(1);
  });

  it('future split은 원 series를 닫고 새 series의 recurrence identity와 sequence를 갱신한다', async () => {
    const recurrenceStarts = [0, 7, 14].map(
      (dayOffset) => new Date(startAt.getTime() + dayOffset * 86_400_000),
    );
    const scheduled = await schedulingRepository.scheduleMeeting(
      ...scheduleInput(
        organizerA,
        {},
        recurrenceStarts.map((occurrenceStart) => ({
          startAt: occurrenceStart,
          endAt: new Date(occurrenceStart.getTime() + 3_600_000),
          recurrenceOriginalStartAt: occurrenceStart,
        })),
        {
          frequency: 'weekly',
          interval: 1,
          count: 3,
          until: null,
          byWeekday: ['WE'],
          timeZone: 'Asia/Seoul',
        },
      ),
    );
    if (scheduled.status !== 'scheduled') {
      throw new Error('future split 준비 Meeting을 생성하지 못했습니다.');
    }
    const [past, ...future] = scheduled.records;
    const sourceSeriesId = past?.meeting.recurrenceSeriesId;
    if (!past || !sourceSeriesId || future.length !== 2) {
      throw new Error('future split 준비 recurrence 정보를 찾지 못했습니다.');
    }

    const updates = future.map((record) => {
      const shiftedStartAt = new Date(
        record.meeting.startAt.getTime() + 86_400_000,
      );
      return {
        id: record.meeting.id,
        startAt: shiftedStartAt,
        endAt: new Date(shiftedStartAt.getTime() + 3_600_000),
        timeZone: 'Asia/Seoul',
        locationType: 'online' as const,
        meetingRoomId: null,
        locationText: null,
        recurrenceOriginalStartAt: shiftedStartAt,
      };
    });
    const result = await schedulingRepository.rescheduleMeetings(
      ...rescheduleInput(updates, {
        kind: 'split',
        sourceSeriesId,
        sourceChanges: {
          count: null,
          until: past.meeting.recurrenceOriginalStartAt,
        },
        meetingIds: future.map((record) => record.meeting.id),
        create: {
          frequency: 'weekly',
          interval: 1,
          count: 2,
          until: null,
          byWeekday: ['TH'],
          timeZone: 'Asia/Seoul',
        },
      }),
    );
    expect(result.status).toBe('updated');

    const storedPast = await queryRepository.findMeetingById(
      organizationId,
      past.meeting.id,
    );
    expect(storedPast?.recurrence).toMatchObject({
      id: sourceSeriesId,
      count: null,
      until: past.meeting.recurrenceOriginalStartAt,
      byWeekday: ['WE'],
    });
    expect(storedPast?.meeting.iCalSequence).toBe(1);

    if (result.status !== 'updated') return;
    const splitSeriesIds = new Set(
      result.records.map((record) => record.meeting.recurrenceSeriesId),
    );
    expect(splitSeriesIds.size).toBe(1);
    expect(splitSeriesIds.has(sourceSeriesId)).toBe(false);
    expect(result.records[0]?.recurrence).toMatchObject({
      count: 2,
      until: null,
      byWeekday: ['TH'],
      timeZone: 'Asia/Seoul',
    });
    expect(
      result.records.every((record) => record.meeting.iCalSequence === 1),
    ).toBe(true);
  });

  it('series 조회는 occurrence를 이동해도 원래 recurrence 순서를 유지한다', async () => {
    const recurrenceStarts = [0, 7, 14].map(
      (dayOffset) => new Date(startAt.getTime() + dayOffset * 86_400_000),
    );
    const scheduled = await schedulingRepository.scheduleMeeting(
      ...scheduleInput(
        organizerA,
        {},
        recurrenceStarts.map((occurrenceStart) => ({
          startAt: occurrenceStart,
          endAt: new Date(occurrenceStart.getTime() + 3_600_000),
          recurrenceOriginalStartAt: occurrenceStart,
        })),
        {
          frequency: 'weekly',
          interval: 1,
          count: 3,
          until: null,
          byWeekday: ['WE'],
          timeZone: 'Asia/Seoul',
        },
      ),
    );
    if (scheduled.status !== 'scheduled') {
      throw new Error('series 정렬 준비 Meeting을 생성하지 못했습니다.');
    }
    const middle = scheduled.records.find(
      (record) =>
        record.meeting.recurrenceOriginalStartAt?.getTime() ===
        recurrenceStarts[1]?.getTime(),
    );
    const recurrenceSeriesId = middle?.meeting.recurrenceSeriesId;
    if (!middle || !recurrenceSeriesId) {
      throw new Error('series 정렬 준비 recurrence 정보를 찾지 못했습니다.');
    }

    const moved = await schedulingRepository.rescheduleMeetings(
      ...rescheduleInput([
        {
          id: middle.meeting.id,
          startAt: new Date('2026-10-28T00:00:00.000Z'),
          endAt: new Date('2026-10-28T01:00:00.000Z'),
          timeZone: 'Asia/Seoul',
          locationType: 'online',
          meetingRoomId: null,
          locationText: null,
        },
      ]),
    );
    expect(moved.status).toBe('updated');

    const series = await queryRepository.listMeetingsInSeries(
      organizationId,
      recurrenceSeriesId,
    );
    expect(
      series.map((record) =>
        record.meeting.recurrenceOriginalStartAt?.toISOString(),
      ),
    ).toEqual(recurrenceStarts.map((value) => value.toISOString()));
  });

  async function cleanup(): Promise<void> {
    await database
      .delete(meeting)
      .where(eq(meeting.organizationId, organizationId));
    await database
      .delete(meetingRecurrenceSeries)
      .where(eq(meetingRecurrenceSeries.organizationId, organizationId));
    await database
      .delete(meetingRoom)
      .where(eq(meetingRoom.organizationId, organizationId));
    await database
      .delete(organization)
      .where(eq(organization.id, organizationId));
    await database.delete(user).where(inArray(user.id, userIds));
  }
});
