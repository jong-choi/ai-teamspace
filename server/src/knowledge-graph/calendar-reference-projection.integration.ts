import { randomUUID } from 'node:crypto';

import { createNeo4jGraph } from '@repo/knowledge-graph';
import { MeetingProjectionSourceSchema } from '@/calendar/domain/meeting-projection-source';
import { MeetingRecurrenceSeriesSchema } from '@/calendar/domain/meeting-recurrence-series';
import { MeetingRoomSchema } from '@/calendar/domain/meeting-room';
import knowledgeGraphConfig from '@/knowledge-graph/config/knowledge-graph.config';
import { LangchainNeo4jGraphAdapter } from '@/knowledge-graph/infrastructure/graph/langchain-neo4j-graph.adapter';
import { OutboxAggregateVersionSchema } from '@/outbox/outbox-aggregate-event.schema';

const describeWritable =
  process.env.KG_TEST_ALLOW_WRITE === '1' && process.env.NEO4J_URI
    ? describe
    : describe.skip;

describeWritable('실제 Neo4j Calendar 공유 원본의 독립 fence', () => {
  const organizationId = `kg-calendar-ref-${randomUUID()}`;
  const meetingId = randomUUID();
  const roomId = randomUUID();
  const seriesId = randomUUID();
  const actorId = randomUUID();
  const attendeeId = randomUUID();
  const fixedAt = new Date('2026-10-09T00:00:00.000Z');
  let graph: Awaited<ReturnType<typeof createNeo4jGraph>>;
  let writer: LangchainNeo4jGraphAdapter;

  beforeAll(async () => {
    const config = knowledgeGraphConfig();
    if (!config.url || !config.username || !config.password)
      throw new Error('Neo4j 검증 설정이 없습니다.');
    graph = await createNeo4jGraph({
      url: config.url,
      username: config.username,
      password: config.password,
      database: config.database,
    });
    writer = new LangchainNeo4jGraphAdapter(config);
  });
  async function cleanup() {
    await graph.query(
      'MATCH (node) WHERE node.organizationId = $organizationId OR (node:KGProjectionSource AND any(prefix IN $prefixes WHERE node.key STARTS WITH prefix)) DETACH DELETE node',
      {
        organizationId,
        prefixes: ['meeting', 'meeting_room', 'meeting_recurrence'].map(
          (kind) => `["${kind}","${organizationId}",`,
        ),
      },
    );
  }
  beforeEach(cleanup);
  afterAll(async () => {
    try {
      if (graph) await cleanup();
    } finally {
      await writer?.onApplicationShutdown();
      await graph?.close();
    }
  });

  function tracking(
    kind: ReturnType<
      typeof OutboxAggregateVersionSchema.parse
    >['aggregateKind'],
    id: string,
    version: number,
    deleted = false,
  ) {
    return OutboxAggregateVersionSchema.parse({
      organizationId,
      aggregateKind: kind,
      aggregateId: id,
      desiredSeq: version,
      appliedSeq: 0,
      deleted,
      projectionStatus: 'pending',
      lastAttemptedAt: null,
      appliedAt: null,
      lastError: null,
      updatedAt: fixedAt,
    });
  }
  function room() {
    return MeetingRoomSchema.parse({
      id: roomId,
      organizationId,
      name: '최신 회의실',
      capacity: 8,
      floor: '3층',
      description: null,
      active: false,
      createdAt: fixedAt,
      updatedAt: fixedAt,
    });
  }
  function series() {
    return MeetingRecurrenceSeriesSchema.parse({
      id: seriesId,
      organizationId,
      frequency: 'daily',
      interval: 2,
      count: 10,
      until: null,
      byWeekday: [],
      timeZone: 'UTC',
      createdAt: fixedAt,
      updatedAt: fixedAt,
    });
  }
  function meeting(id = meetingId) {
    return MeetingProjectionSourceSchema.parse({
      id,
      organizationId,
      projectId: '확인되지 않은 참조',
      organizerUserId: actorId,
      title: '회의',
      category: 'team',
      startAt: fixedAt,
      endAt: new Date(fixedAt.getTime() + 3_600_000),
      timeZone: 'UTC',
      locationType: 'meeting_room',
      meetingRoomId: roomId,
      locationText: null,
      reminderMinutes: null,
      recurrenceSeriesId: seriesId,
      recurrenceOriginalStartAt: fixedAt,
      canceledAt: null,
      updatedAt: fixedAt,
      room: {
        id: roomId,
        name: '오래된 이름',
        capacity: 1,
        floor: null,
        active: true,
      },
      recurrence: {
        id: seriesId,
        frequency: 'weekly',
        interval: 1,
        count: 2,
        until: null,
        timeZone: 'Asia/Seoul',
      },
      attendees: [
        { userId: actorId, status: 'pending' },
        { userId: attendeeId, status: 'accepted' },
      ],
    });
  }

  it('두 Meeting의 역순 snapshot과 큰 버전은 Room·Recurrence owner의 속성을 덮지 않는다', async () => {
    await writer.applyMeetingRoom(tracking('meeting_room', roomId, 10), room());
    await writer.applyMeetingRecurrence(
      tracking('meeting_recurrence', seriesId, 5),
      series(),
    );
    const otherId = randomUUID();
    await writer.applyMeeting(tracking('meeting', meetingId, 100), meeting());
    await writer.applyMeeting(
      tracking('meeting', otherId, 200),
      meeting(otherId),
    );
    await writer.applyMeetingRoom(tracking('meeting_room', roomId, 9), {
      ...room(),
      name: 'stale',
      active: true,
    });
    await writer.applyMeetingRecurrence(
      tracking('meeting_recurrence', seriesId, 4),
      { ...series(), count: 2 },
    );
    expect(
      await graph.query(
        'MATCH (room:KGWorkOSMeetingRoom {organizationId: $organizationId}) RETURN room.name AS name, room.active AS active, room.placeholder AS placeholder',
        { organizationId },
      ),
    ).toEqual([{ name: '최신 회의실', active: false, placeholder: false }]);
    expect(
      await graph.query(
        'MATCH (series:KGWorkOSMeetingRecurrence {organizationId: $organizationId}) RETURN series.frequency AS frequency, series.count AS count, series.interval AS interval, series.timeZone AS timeZone, series.placeholder AS placeholder',
        { organizationId },
      ),
    ).toEqual([
      {
        frequency: 'daily',
        count: 10,
        interval: 2,
        timeZone: 'UTC',
        placeholder: false,
      },
    ]);
    expect(
      await graph.query(
        'MATCH (:KGWorkOSMeeting {organizationId: $organizationId})-[relation]->(:KGWorkOSProject) RETURN count(relation) AS count',
        { organizationId },
      ),
    ).toEqual([{ count: '0' }]);
  });

  it('Meeting placeholder를 각 공유 owner가 완성하고 공유 tombstone은 Meeting replay로 부활하지 않는다', async () => {
    await writer.applyMeeting(tracking('meeting', meetingId, 1), meeting());
    expect(
      await graph.query(
        'MATCH (series:KGWorkOSMeetingRecurrence {organizationId: $organizationId}) RETURN series.placeholder AS placeholder, series.frequency AS frequency',
        { organizationId },
      ),
    ).toEqual([{ placeholder: true, frequency: null }]);
    await writer.applyMeetingRoom(tracking('meeting_room', roomId, 1), room());
    await writer.applyMeetingRecurrence(
      tracking('meeting_recurrence', seriesId, 1),
      series(),
    );
    await writer.applyMeetingRoom(
      tracking('meeting_room', roomId, 2, true),
      null,
    );
    await writer.applyMeetingRecurrence(
      tracking('meeting_recurrence', seriesId, 2, true),
      null,
    );
    await writer.applyMeeting(tracking('meeting', meetingId, 2), meeting());
    expect(
      await graph.query(
        'MATCH (room:KGWorkOSMeetingRoom {organizationId: $organizationId}), (series:KGWorkOSMeetingRecurrence {organizationId: $organizationId}) RETURN room.deleted AS roomDeleted, series.deleted AS seriesDeleted',
        { organizationId },
      ),
    ).toEqual([{ roomDeleted: true, seriesDeleted: true }]);
  });

  it('참석자·Room·Recurrence의 NULL 교체와 병렬 최신 상태가 source 관계 한 개로 수렴한다', async () => {
    await writer.applyMeeting(tracking('meeting', meetingId, 1), meeting());
    const current = meeting();
    current.meetingRoomId = null;
    current.room = null;
    current.recurrenceSeriesId = null;
    current.recurrence = null;
    current.locationType = 'online';
    current.attendees = [{ userId: actorId, status: 'declined' }];
    current.canceledAt = fixedAt;
    await Promise.all(
      Array.from({ length: 5 }, (_, index) =>
        writer.applyMeeting(tracking('meeting', meetingId, index + 2), {
          ...current,
          title: `회의 ${index + 2}`,
        }),
      ),
    );
    expect(
      await graph.query(
        'MATCH (meeting:KGWorkOSMeeting {key: $key})-[relation]->(target) RETURN meeting.title AS title, type(relation) AS kind, target.sourceId AS id, relation.status AS status ORDER BY kind',
        { key: JSON.stringify(['meeting', organizationId, meetingId]) },
      ),
    ).toEqual([
      {
        title: '회의 6',
        kind: 'KG_MEETING_ATTENDEE',
        id: actorId,
        status: 'declined',
      },
      {
        title: '회의 6',
        kind: 'KG_MEETING_ORGANIZER',
        id: actorId,
        status: null,
      },
    ]);
    await writer.applyMeeting(tracking('meeting', meetingId, 7, true), null);
    await writer.applyMeeting(tracking('meeting', meetingId, 6), meeting());
    expect(
      await graph.query(
        'MATCH (meeting:KGWorkOSMeeting {key: $key}) OPTIONAL MATCH (meeting)-[relation]->() RETURN meeting.deleted AS deleted, count(relation) AS count',
        { key: JSON.stringify(['meeting', organizationId, meetingId]) },
      ),
    ).toEqual([{ deleted: true, count: '0' }]);
  });

  it('조직과 공유 참조 ID가 잘못된 snapshot은 graph 쓰기 전에 거부한다', async () => {
    await expect(
      writer.applyMeetingRoom(tracking('meeting_room', roomId, 1), {
        ...room(),
        organizationId: 'other',
      }),
    ).rejects.toThrow('일치하지 않습니다');
    await expect(
      writer.applyMeetingRecurrence(
        tracking('meeting_recurrence', seriesId, 1),
        { ...series(), id: randomUUID() },
      ),
    ).rejects.toThrow('일치하지 않습니다');
    await expect(
      writer.applyMeeting(tracking('meeting', meetingId, 1), {
        ...meeting(),
        meetingRoomId: randomUUID(),
      }),
    ).rejects.toThrow('일치하지 않습니다');
    await expect(
      writer.applyMeeting(tracking('meeting', meetingId, 1), {
        ...meeting(),
        recurrenceSeriesId: randomUUID(),
      }),
    ).rejects.toThrow('일치하지 않습니다');
    expect(
      await graph.query(
        'MATCH (node) WHERE node.organizationId = $organizationId RETURN count(node) AS count',
        { organizationId },
      ),
    ).toEqual([{ count: '0' }]);
  });
});
