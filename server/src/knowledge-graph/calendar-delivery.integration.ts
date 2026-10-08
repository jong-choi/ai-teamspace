import { randomUUID } from 'node:crypto';

import { Test, type TestingModule } from '@nestjs/testing';

import { createNeo4jGraph } from '@repo/knowledge-graph';
import {
  organization,
  user,
} from '@/auth/infrastructure/persistence/drizzle/generated/auth.schema';
import { CreateMeetingSchema } from '@/calendar/dto/create-meeting.dto';
import { CalendarSchedulingRepository } from '@/calendar/infrastructure/persistence/calendar-scheduling.repository';
import { CalendarDrizzlePersistenceModule } from '@/calendar/infrastructure/persistence/drizzle/drizzle-persistence.module';
import { MeetingParticipationRepository } from '@/calendar/infrastructure/persistence/meeting-participation.repository';
import { MeetingRoomRepository } from '@/calendar/infrastructure/persistence/meeting-room.repository';
import { DatabaseService } from '@/database/database.service';
import { JobsModule } from '@/jobs/jobs.module';
import knowledgeGraphConfig from '@/knowledge-graph/config/knowledge-graph.config';
import { outboxAggregateVersion } from '@/outbox/infrastructure/persistence/drizzle/schema/outbox-aggregate-version.schema';

import { waitForCondition } from '@test/agent/support/workos-agent.e2e-support';
import { and, eq } from 'drizzle-orm';

jest.setTimeout(30_000);

const describeWritable =
  process.env.KG_TEST_ALLOW_WRITE === '1' && process.env.NEO4J_URI
    ? describe
    : describe.skip;

describeWritable('Calendar의 실제 PG·Jobs·Neo4j 연결', () => {
  const organizationId = `kg-calendar-flow-${randomUUID()}`;
  const actorId = `kg-calendar-actor-${randomUUID()}`;
  const attendeeId = `kg-calendar-attendee-${randomUUID()}`;
  const original = new Map<string, string | undefined>();
  let app: TestingModule;
  let database: DatabaseService['db'];
  let graph: Awaited<ReturnType<typeof createNeo4jGraph>>;
  let scheduling: CalendarSchedulingRepository;
  let rooms: MeetingRoomRepository;
  let participation: MeetingParticipationRepository;

  beforeAll(async () => {
    for (const [key, value] of Object.entries({
      KG_PROJECTION_ENABLED: 'true',
      BULLMQ_PREFIX: `kg-calendar-flow-${randomUUID()}`,
    })) {
      original.set(key, process.env[key]);
      process.env[key] = value;
    }
    const config = knowledgeGraphConfig();
    if (!config.url || !config.username || !config.password)
      throw new Error('검증 Neo4j 설정이 없습니다.');
    graph = await createNeo4jGraph({
      url: config.url,
      username: config.username,
      password: config.password,
      database: config.database,
    });
    app = await Test.createTestingModule({
      imports: [JobsModule, CalendarDrizzlePersistenceModule],
    }).compile();
    await app.init();
    database = app.get(DatabaseService).db;
    scheduling = app.get(CalendarSchedulingRepository);
    rooms = app.get(MeetingRoomRepository);
    participation = app.get(MeetingParticipationRepository);
    await database.insert(user).values(
      [actorId, attendeeId].map((id) => ({
        id,
        name: 'Calendar 흐름 검증',
        email: `${id}@example.com`,
        username: id,
      })),
    );
    await database.insert(organization).values({
      id: organizationId,
      name: 'Calendar 흐름 조직',
      slug: organizationId,
      createdAt: new Date(),
    });
  });

  afterAll(async () => {
    try {
      if (database) {
        await database
          .delete(outboxAggregateVersion)
          .where(eq(outboxAggregateVersion.organizationId, organizationId));
        await database
          .delete(organization)
          .where(eq(organization.id, organizationId));
        await database.delete(user).where(eq(user.id, actorId));
        await database.delete(user).where(eq(user.id, attendeeId));
      }
      if (graph)
        await graph.query(
          `MATCH (node) WHERE node.organizationId = $organizationId OR (node:KGProjectionSource AND any(prefix IN $prefixes WHERE node.key STARTS WITH prefix)) DETACH DELETE node`,
          {
            organizationId,
            prefixes: ['meeting', 'meeting_room', 'meeting_recurrence'].map(
              (kind) => `["${kind}","${organizationId}",`,
            ),
          },
        );
    } finally {
      try {
        await app?.close();
        await graph?.close();
      } finally {
        for (const [key, value] of original) {
          if (value === undefined) delete process.env[key];
          else process.env[key] = value;
        }
      }
    }
  });

  async function state(
    kind: typeof outboxAggregateVersion.$inferSelect.aggregateKind,
    id: string,
  ) {
    const [row] = await database
      .select()
      .from(outboxAggregateVersion)
      .where(
        and(
          eq(outboxAggregateVersion.organizationId, organizationId),
          eq(outboxAggregateVersion.aggregateKind, kind),
          eq(outboxAggregateVersion.aggregateId, id),
        ),
      );
    return row;
  }
  async function applied(
    kind: typeof outboxAggregateVersion.$inferSelect.aggregateKind,
    id: string,
    version: number,
  ) {
    await waitForCondition(
      async () => (await state(kind, id))?.appliedSeq === version,
      `Calendar ${kind} 버전 ${version}의 투영이 완료되지 않았습니다.`,
      { timeoutMs: 15_000 },
    );
  }
  function key(kind: string, id: string) {
    return JSON.stringify([kind, organizationId, id]);
  }

  it('Room owner 변경·RSVP·참석자 교체·장소 변경·취소를 실제 graph에 반영한다', async () => {
    const room = await rooms.createMeetingRoom(organizationId, {
      name: '회의실',
      capacity: 5,
    });
    await applied('meeting_room', room.id, 1);
    const same = await rooms.updateMeetingRoom(organizationId, room.id, {
      name: room.name,
      active: true,
    });
    expect(same?.updatedAt).toEqual(room.updatedAt);
    expect((await state('meeting_room', room.id))?.desiredSeq).toBe(1);
    const input = CreateMeetingSchema.parse({
      title: '회의',
      category: 'team',
      startAt: '2026-11-01T01:00:00.000Z',
      endAt: '2026-11-01T02:00:00.000Z',
      timeZone: 'UTC',
      locationType: 'meeting_room',
      meetingRoomId: room.id,
      attendeeUserIds: [actorId, attendeeId],
    });
    const result = await scheduling.scheduleMeeting(
      organizationId,
      actorId,
      input,
      input.attendeeUserIds,
      [
        {
          startAt: new Date(input.startAt),
          endAt: new Date(input.endAt),
          recurrenceOriginalStartAt: null,
        },
      ],
      null,
      randomUUID(),
    );
    if (result.status !== 'scheduled')
      throw new Error('회의 생성 결과가 없습니다.');
    const meeting = result.records[0].meeting;
    await applied('meeting', meeting.id, 1);
    await rooms.updateMeetingRoom(organizationId, room.id, {
      name: '수정 회의실',
      active: false,
    });
    await applied('meeting_room', room.id, 2);
    expect(
      await graph.query(
        'MATCH (:KGWorkOSMeeting {key: $key})-[:KG_MEETING_ROOM]->(room) RETURN room.name AS name, room.active AS active, room.placeholder AS placeholder',
        { key: key('meeting', meeting.id) },
      ),
    ).toEqual([{ name: '수정 회의실', active: false, placeholder: false }]);
    const rsvp = await participation.updateAttendeeRsvp(
      organizationId,
      meeting.id,
      attendeeId,
      { status: 'accepted' },
    );
    expect(rsvp.status).toBe('updated');
    await applied('meeting', meeting.id, 2);
    expect(
      await graph.query(
        'MATCH (:KGWorkOSMeeting {key: $key})-[relation:KG_MEETING_ATTENDEE]->(attendee) RETURN attendee.sourceId AS userId, relation.status AS status ORDER BY userId',
        { key: key('meeting', meeting.id) },
      ),
    ).toEqual(
      [actorId, attendeeId]
        .sort((left, right) => left.localeCompare(right))
        .map((userId) => ({
          userId,
          status: userId === attendeeId ? 'accepted' : 'pending',
        })),
    );
    await participation.replaceMeetingAttendees(
      organizationId,
      meeting.id,
      { attendeeUserIds: [actorId] },
      [],
    );
    await applied('meeting', meeting.id, 3);
    const moved = await scheduling.rescheduleMeetings(
      organizationId,
      {
        startAt: '2026-11-01T03:00:00.000Z',
        endAt: '2026-11-01T04:00:00.000Z',
        timeZone: 'UTC',
        locationType: 'online',
        meetingRoomId: null,
        locationText: '온라인',
        scope: 'single',
      },
      [
        {
          id: meeting.id,
          startAt: new Date('2026-11-01T03:00:00.000Z'),
          endAt: new Date('2026-11-01T04:00:00.000Z'),
        },
      ],
      [],
    );
    expect(moved.status).toBe('updated');
    await applied('meeting', meeting.id, 4);
    await scheduling.cancelMeetings(organizationId, [meeting.id], actorId, {
      scope: 'single',
      reason: '취소 검증',
    });
    await applied('meeting', meeting.id, 5);
    expect(
      await graph.query(
        'MATCH (meeting:KGWorkOSMeeting {key: $key}) OPTIONAL MATCH (meeting)-[relation:KG_MEETING_ROOM]->() RETURN meeting.canceledAt IS NOT NULL AS canceled, count(relation) AS rooms',
        { key: key('meeting', meeting.id) },
      ),
    ).toEqual([{ canceled: true, rooms: '0' }]);
    expect(
      await graph.query(
        'MATCH (:KGWorkOSMeeting {key: $key})-[:KG_MEETING_ATTENDEE]->(attendee) RETURN attendee.sourceId AS id',
        { key: key('meeting', meeting.id) },
      ),
    ).toEqual([{ id: actorId }]);
  });

  it('반복 일정 분할에서 공유 owner·남은 회의·빈 series tombstone까지 반영한다', async () => {
    const input = CreateMeetingSchema.parse({
      title: '반복',
      category: 'team',
      startAt: '2026-12-01T01:00:00.000Z',
      endAt: '2026-12-01T02:00:00.000Z',
      timeZone: 'UTC',
      locationType: 'online',
      attendeeUserIds: [actorId],
    });
    const occurrences = Array.from({ length: 4 }, (_, index) => ({
      startAt: new Date(Date.parse(input.startAt) + index * 86_400_000),
      endAt: new Date(Date.parse(input.endAt) + index * 86_400_000),
      recurrenceOriginalStartAt: new Date(
        Date.parse(input.startAt) + index * 86_400_000,
      ),
    }));
    const result = await scheduling.scheduleMeeting(
      organizationId,
      actorId,
      input,
      input.attendeeUserIds,
      occurrences,
      {
        frequency: 'daily',
        interval: 1,
        count: 4,
        until: null,
        byWeekday: [],
        timeZone: 'UTC',
      },
      randomUUID(),
    );
    if (result.status !== 'scheduled')
      throw new Error('반복 일정 생성 결과가 없습니다.');
    const meetings = result.records.map((record) => record.meeting);
    const seriesId = meetings[0].recurrenceSeriesId;
    if (!seriesId) throw new Error('반복 일정 series가 없습니다.');
    await Promise.all([
      applied('meeting_recurrence', seriesId, 1),
      ...meetings.map((meeting) => applied('meeting', meeting.id, 1)),
    ]);
    const splitTargets = meetings.slice(2);
    const updates = splitTargets.map((meeting) => ({
      id: meeting.id,
      startAt: new Date(meeting.startAt.getTime() + 3_600_000),
      endAt: new Date(meeting.endAt.getTime() + 3_600_000),
    }));
    const reschedule = {
      startAt: updates[0].startAt.toISOString(),
      endAt: updates[0].endAt.toISOString(),
      timeZone: 'UTC',
      locationType: 'online',
      meetingRoomId: null,
      locationText: null,
      scope: 'future',
    };
    const split = await scheduling.rescheduleMeetings(
      organizationId,
      { ...reschedule, scope: 'future', locationType: 'online' },
      updates,
      [],
      {
        kind: 'split',
        sourceSeriesId: seriesId,
        sourceChanges: { count: 2 },
        create: {
          frequency: 'daily',
          interval: 1,
          count: 2,
          until: null,
          byWeekday: [],
          timeZone: 'UTC',
        },
        meetingIds: splitTargets.map((meeting) => meeting.id),
      },
    );
    if (split.status !== 'updated')
      throw new Error('반복 일정 분할 결과가 없습니다.');
    const nextSeriesId = split.records[0].meeting.recurrenceSeriesId;
    if (!nextSeriesId) throw new Error('분할 series가 없습니다.');
    await Promise.all([
      applied('meeting_recurrence', seriesId, 2),
      applied('meeting_recurrence', nextSeriesId, 1),
      ...meetings.map((meeting) => applied('meeting', meeting.id, 2)),
    ]);
    expect(
      await graph.query(
        'MATCH (series:KGWorkOSMeetingRecurrence {organizationId: $organizationId}) RETURN series.sourceId AS id, series.count AS count, series.placeholder AS placeholder',
        { organizationId },
      ),
    ).toEqual(
      expect.arrayContaining([
        { id: seriesId, count: 2, placeholder: false },
        { id: nextSeriesId, count: 2, placeholder: false },
      ]),
    );
    for (const meeting of meetings)
      expect(
        await graph.query(
          'MATCH (:KGWorkOSMeeting {key: $key})-[:KG_MEETING_RECURRENCE]->(series) RETURN series.sourceId AS id',
          { key: key('meeting', meeting.id) },
        ),
      ).toEqual([
        {
          id: splitTargets.some((target) => target.id === meeting.id)
            ? nextSeriesId
            : seriesId,
        },
      ]);
    const remaining = meetings.slice(0, 2);
    const allSplit = await scheduling.rescheduleMeetings(
      organizationId,
      { ...reschedule, scope: 'future', locationType: 'online' },
      remaining.map((meeting) => ({
        id: meeting.id,
        startAt: meeting.startAt,
        endAt: meeting.endAt,
      })),
      [],
      {
        kind: 'split',
        sourceSeriesId: seriesId,
        sourceChanges: { count: 2 },
        create: {
          frequency: 'daily',
          interval: 1,
          count: 2,
          until: null,
          byWeekday: [],
          timeZone: 'UTC',
        },
        meetingIds: remaining.map((meeting) => meeting.id),
      },
    );
    expect(allSplit.status).toBe('updated');
    await applied('meeting_recurrence', seriesId, 4);
    expect(
      await graph.query(
        'MATCH (series:KGWorkOSMeetingRecurrence {key: $key}) RETURN series.deleted AS deleted',
        { key: key('meeting_recurrence', seriesId) },
      ),
    ).toEqual([{ deleted: true }]);
  });
});
