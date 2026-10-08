import { randomUUID } from 'node:crypto';

import { OutboxRelay } from '@nestjs/outbox';
import { Test, type TestingModule } from '@nestjs/testing';

import { createNeo4jGraph } from '@repo/knowledge-graph';
import type { Auth } from '@/auth/auth';
import {
  member,
  organization,
  user,
} from '@/auth/infrastructure/persistence/drizzle/generated/auth.schema';
import { CalendarSchedulingRepository } from '@/calendar/infrastructure/persistence/calendar-scheduling.repository';
import { CalendarDrizzlePersistenceModule } from '@/calendar/infrastructure/persistence/drizzle/drizzle-persistence.module';
import { DatabaseService } from '@/database/database.service';
import { JobsModule } from '@/jobs/jobs.module';
import { KnowledgeGraphJobsModule } from '@/jobs/knowledge-graph/knowledge-graph-jobs.module';
import { KnowledgeGraphMembershipBridge } from '@/jobs/knowledge-graph/knowledge-graph-membership-bridge';
import { KNOWLEDGE_GRAPH_PROJECTION_QUEUE } from '@/jobs/knowledge-graph/knowledge-graph-projection.job';
import { KnowledgeGraphProjectionProcessor } from '@/jobs/knowledge-graph/knowledge-graph-projection.processor';
import { KnowledgeGraphReconciliationScheduler } from '@/jobs/knowledge-graph/knowledge-graph-reconciliation.scheduler';
import knowledgeGraphConfig from '@/knowledge-graph/config/knowledge-graph.config';
import { CuratedGraphModule } from '@/knowledge-graph/curated-graph.module';
import { CuratedGraphService } from '@/knowledge-graph/curated-graph.service';
import { digestGraphJson } from '@/knowledge-graph/domain/graph-json-digest';
import { KnowledgeGraphWriter } from '@/knowledge-graph/infrastructure/graph/knowledge-graph-writer.provider';
import { reconciliationScope } from '@/knowledge-graph/infrastructure/persistence/drizzle/schema/reconciliation-scope.schema';
import { WorkosSourceProvider } from '@/knowledge-graph/infrastructure/source/workos-source.provider';
import { KnowledgeGraphReconciliationService } from '@/knowledge-graph/knowledge-graph-reconciliation.service';
import { outboxAggregateVersion } from '@/outbox/infrastructure/persistence/drizzle/schema/outbox-aggregate-version.schema';
import { OutboxAggregateChangePublisher } from '@/outbox/outbox-aggregate-change.publisher';
import { OutboxAggregateProjectionState } from '@/outbox/outbox-aggregate-projection-state';
import { ProjectDrizzlePersistenceModule } from '@/projects/infrastructure/persistence/drizzle/drizzle-persistence.module';
import { project } from '@/projects/infrastructure/persistence/drizzle/schema/project.schema';
import { ProjectRepository } from '@/projects/infrastructure/persistence/project.repository';
import { ProjectColumnRepository } from '@/projects/infrastructure/persistence/project-column.repository';
import { TicketRepository } from '@/projects/infrastructure/persistence/ticket.repository';
import { createRedisOptions } from '@/queue/queue.config';
import { WikiDrizzlePersistenceModule } from '@/wiki/infrastructure/persistence/drizzle/drizzle-persistence.module';
import { WikiRepository } from '@/wiki/infrastructure/persistence/wiki.repository';

import { waitForCondition } from '@test/agent/support/workos-agent.e2e-support';
import { AuthService } from '@thallesp/nestjs-better-auth';
import { Queue } from 'bullmq';
import { and, eq, inArray, lt } from 'drizzle-orm';
import * as Y from 'yjs';

const writable =
  process.env.KG_TEST_ALLOW_WRITE === '1' &&
  process.env.NEO4J_URI &&
  process.env.DATABASE_URL &&
  new URL(process.env.DATABASE_URL).pathname === '/graph_p6_reconciliation';
const describeWritable = writable ? describe : describe.skip;
jest.setTimeout(120_000);

describeWritable('P6 실제 PG·Redis·Jobs·Neo4j 복구 수락', () => {
  let jobs: TestingModule;
  const contexts = new Set<TestingModule>();
  const relays = new Map<TestingModule, OutboxRelay>();
  let database: DatabaseService['db'];
  let graph: Awaited<ReturnType<typeof createNeo4jGraph>>;
  let queue: Queue;
  const organizations = new Set<string>();
  const actors = new Set<string>();
  const original = new Map<string, string | undefined>();

  async function startJobs() {
    const app = await Test.createTestingModule({
      imports: [
        JobsModule,
        WikiDrizzlePersistenceModule,
        ProjectDrizzlePersistenceModule,
        CalendarDrizzlePersistenceModule,
        CuratedGraphModule,
      ],
    }).compile();
    contexts.add(app);
    await app.init();
    const active = app
      .get(OutboxRelay, { each: true })
      .filter((relay) => relay.running);
    if (active.length !== 1 || !active[0])
      throw new Error('Jobs 활성 relay가 하나가 아닙니다.');
    relays.set(app, active[0]);
    // 부팅 tick의 완료를 기다리고 이후 tick은 각 수락 시나리오에서 명시적으로 실행한다.
    await app.get(KnowledgeGraphReconciliationScheduler).onModuleDestroy();
    return app;
  }
  const relay = (app = jobs) => {
    const active = relays.get(app);
    if (!active) throw new Error('Jobs relay가 없습니다.');
    return active;
  };
  const state = () =>
    jobs
      .select(KnowledgeGraphJobsModule)
      .get(OutboxAggregateProjectionState, { strict: true });
  const scheduler = (app = jobs) =>
    app.get(KnowledgeGraphReconciliationScheduler);
  const auth = () => jobs.get(AuthService<Auth>).instance;

  beforeEach(async () => {
    const prefix = `kg-p6-${randomUUID()}`;
    for (const [name, value] of Object.entries({
      KG_PROJECTION_ENABLED: 'true',
      BULLMQ_PREFIX: prefix,
    })) {
      original.set(name, process.env[name]);
      process.env[name] = value;
    }
    const redisUrl = process.env.REDIS_QUEUE_URL;
    if (!redisUrl) throw new Error('전용 Redis 설정이 없습니다.');
    queue = new Queue(KNOWLEDGE_GRAPH_PROJECTION_QUEUE, {
      prefix,
      connection: createRedisOptions(redisUrl),
    });
    await queue.pause();
    jobs = await startJobs();
    database = jobs.get(DatabaseService).db;
    const config = knowledgeGraphConfig();
    if (!config.url || !config.username || !config.password)
      throw new Error('전용 Neo4j 설정이 없습니다.');
    graph = await createNeo4jGraph({
      url: config.url,
      username: config.username,
      password: config.password,
      database: config.database,
    });
  });
  afterEach(async () => {
    jest.restoreAllMocks();
    try {
      for (const app of contexts) {
        await scheduler(app).onModuleDestroy();
        await relay(app).stop();
        await app.get(KnowledgeGraphProjectionProcessor).worker.close(true);
      }
      if (database) {
        if (organizations.size) {
          await database
            .delete(outboxAggregateVersion)
            .where(
              inArray(outboxAggregateVersion.organizationId, [
                ...organizations,
              ]),
            );
          await database
            .delete(reconciliationScope)
            .where(
              inArray(reconciliationScope.organizationId, [...organizations]),
            );
          await database
            .delete(organization)
            .where(inArray(organization.id, [...organizations]));
        }
        // 전용 DB의 단일 scope만 정리한다. 다른 DB에서 이 suite는 시작하지 않는다.
        await database
          .delete(reconciliationScope)
          .where(
            inArray(reconciliationScope.id, [
              'organizations',
              'membership_sources',
              'organization_presence',
            ]),
          );
        if (actors.size)
          await database.delete(user).where(inArray(user.id, [...actors]));
      }
      if (graph && organizations.size)
        await graph.query(
          'MATCH (node) WHERE node.organizationId IN $organizations OR (node:KGProjectionSource AND any(org IN $organizations WHERE node.key CONTAINS org)) DETACH DELETE node',
          { organizations: [...organizations] },
        );
    } finally {
      for (const app of contexts) await app.close();
      contexts.clear();
      relays.clear();
      await queue?.obliterate({ force: true });
      await queue?.close();
      await graph?.close();
      organizations.clear();
      actors.clear();
      for (const [name, value] of original) {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
      }
      original.clear();
    }
  });

  async function actor() {
    const id = randomUUID();
    const result = await auth().api.signUpEmail({
      body: {
        name: '복구 검증 사용자',
        email: `kg-p6-${id}@example.test`,
        password: 'P6-test-password-only',
        username: `p6${id.replaceAll('-', '').slice(0, 20)}`,
      },
      returnHeaders: true,
    });
    actors.add(result.response.user.id);
    const headers = new Headers({
      cookie: result.headers
        .getSetCookie()
        .map((cookie) => cookie.split(';')[0])
        .join('; '),
    });
    return { userId: result.response.user.id, headers };
  }
  async function createOrganization(owner: Awaited<ReturnType<typeof actor>>) {
    const created = await auth().api.createOrganization({
      body: {
        name: '복구 검증 조직',
        slug: `kg-p6-${randomUUID()}`,
        userId: owner.userId,
      },
    });
    if (!created) throw new Error('조직 생성 결과가 없습니다.');
    organizations.add(created.id);
    return created.id;
  }
  async function createWiki(org: string, actorId: string, title = '복구 문서') {
    const doc = new Y.Doc();
    try {
      return await jobs
        .get(WikiRepository)
        .createDocument(
          org,
          actorId,
          { title, parentDocumentId: null, position: 0, contentMarkdown: '' },
          { encodedState: Y.encodeStateAsUpdate(doc), contentMarkdown: '' },
          1,
        );
    } finally {
      doc.destroy();
    }
  }
  async function createProject(
    org: string,
    actorId: string,
    key = `P${randomUUID().slice(0, 7).toUpperCase()}`,
  ) {
    return jobs
      .get(ProjectRepository)
      .createProjectWithDefaultColumns(org, actorId, {
        key,
        name: '복구 프로젝트',
        leadUserId: null,
      });
  }
  async function rows(org: string) {
    return database
      .select()
      .from(outboxAggregateVersion)
      .where(eq(outboxAggregateVersion.organizationId, org));
  }
  async function converged(org: string, expected?: number) {
    await waitForCondition(
      async () => {
        const current = await rows(org);
        return (
          current.length > 0 &&
          (expected === undefined || current.length === expected) &&
          current.every((row) => row.appliedSeq === row.desiredSeq)
        );
      },
      'PG와 실제 Neo4j 적용 상태가 수렴하지 않았습니다.',
      { timeoutMs: 100_000 },
    );
  }
  async function tick(app = jobs) {
    const startedAt = Date.now();
    const handled = await scheduler(app).runOnce();
    console.info(
      JSON.stringify({
        scenario: 'recovery-tick',
        handled,
        elapsedMs: Date.now() - startedAt,
      }),
    );
  }
  async function due(id: string) {
    await database
      .update(reconciliationScope)
      .set({
        nextRunAt: new Date(0),
        afterOrganizationId: null,
        afterAggregateId: null,
      })
      .where(eq(reconciliationScope.id, id));
  }
  async function publishAll(expected: number) {
    await waitForCondition(
      async () => {
        await relay().runOnce();
        const counts = await queue.getJobCounts('paused', 'waiting');
        return (
          counts.paused + counts.waiting >= expected &&
          (await relay().stats()).pending === 0
        );
      },
      'relay publish를 확인하지 못했습니다.',
      { timeoutMs: 30_000 },
    );
  }
  async function agePending(org: string) {
    await database
      .update(outboxAggregateVersion)
      .set({ updatedAt: new Date(0), lastRequeuedAt: new Date(0) })
      .where(
        and(
          eq(outboxAggregateVersion.organizationId, org),
          lt(
            outboxAggregateVersion.appliedSeq,
            outboxAggregateVersion.desiredSeq,
          ),
        ),
      );
  }

  it('F-01 relay ack 뒤 자기 Redis queue가 유실돼도 PG 기준으로 30개 원본이 수렴한다', async () => {
    const owner = await actor();
    const org = await createOrganization(owner);
    for (let i = 0; i < 20; i++)
      await createWiki(org, owner.userId, `유실 문서 ${i}`);
    for (let i = 0; i < 10; i++) await createProject(org, owner.userId);
    await publishAll(30);
    expect((await rows(org)).every(({ appliedSeq }) => appliedSeq === 0)).toBe(
      true,
    );
    await relay().stop();
    await queue.obliterate({ force: true });
    await agePending(org);
    const startedAt = Date.now();
    await tick();
    relay().start();
    await queue.resume();
    await converged(org, 30);
    expect(
      (await rows(org)).every(({ requeueCount }) => requeueCount === 0),
    ).toBe(true);
    expect(
      await graph.query(
        'MATCH (node) WHERE node.organizationId=$org AND (node:KGWorkOSWikiDocument OR node:KGWorkOSProject) RETURN count(node) AS nodes, count(DISTINCT node.key) AS uniqueNodes',
        { org },
      ),
    ).toEqual([{ nodes: '30', uniqueNodes: '30' }]);
    expect((await relay().stats()).deadLetters).toBe(0);
    console.info(
      JSON.stringify({
        scenario: 'F-01',
        sources: 30,
        elapsedMs: Date.now() - startedAt,
      }),
    );
  });

  it('F-02 applying 도중 worker 중단 후 Jobs 재기동은 최신 snapshot으로 복구한다', async () => {
    const owner = await actor();
    const org = await createOrganization(owner);
    const source = await createProject(org, owner.userId);
    let release = () => {};
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    const processor = jobs.get(KnowledgeGraphProjectionProcessor);
    const stopped = jest
      .spyOn(processor, 'process')
      .mockImplementationOnce(async () => {
        await state().markApplying(org, 'project', source.id, 1);
        await blocked;
      });
    await queue.resume();
    await waitForCondition(
      async () =>
        (await state().current(org, 'project', source.id))?.projectionStatus ===
        'applying',
      'applying 중단 지점이 없습니다.',
    );
    await processor.worker.close(true);
    release();
    stopped.mockRestore();
    await scheduler().onModuleDestroy();
    await relay().stop();
    const previous = jobs;
    const next = await startJobs();
    jobs = next;
    database = jobs.get(DatabaseService).db;
    await previous.close();
    contexts.delete(previous);
    await database
      .update(outboxAggregateVersion)
      .set({ lastAttemptedAt: new Date(0) })
      .where(
        and(
          eq(outboxAggregateVersion.organizationId, org),
          eq(outboxAggregateVersion.aggregateId, source.id),
        ),
      );
    await jobs.get(KnowledgeGraphReconciliationScheduler).runOnce();
    await converged(org);
    expect((await state().current(org, 'project', source.id))?.appliedSeq).toBe(
      1,
    );
    await jobs
      .get(ProjectRepository)
      .updateProject(org, source.id, { name: '중단 뒤 최신' });
    await converged(org);
    expect(
      await graph.query(
        'MATCH (node:KGWorkOSProject {key:$key}) RETURN node.name AS name',
        { key: JSON.stringify(['project', org, source.id]) },
      ),
    ).toEqual([{ name: '중단 뒤 최신' }]);
  });

  it('F-03 실제 10회 시도 소진은 failed를 종결하고 새 owner 변경만 재접수한다', async () => {
    const owner = await actor();
    const org = await createOrganization(owner);
    const failed = await createProject(org, owner.userId);
    const healthy = await createProject(org, owner.userId);
    const writer = jobs.get(KnowledgeGraphWriter);
    const originalApply = writer.applyProject.bind(writer);
    const fail = jest
      .spyOn(writer, 'applyProject')
      .mockImplementation(async (source, snapshot) => {
        if (source.aggregateId === failed.id)
          throw new Error('특정 source 장애 주입');
        await originalApply(source, snapshot);
      });
    await publishAll(2);
    const waiting = await queue.getJobs(['paused', 'waiting']);
    for (const job of waiting) {
      const id = job.id;
      const data = job.data;
      const name = job.name;
      await job.remove();
      await queue.add(name, data, {
        jobId: id,
        attempts: 10,
        backoff: { type: 'exponential', delay: 1 },
      });
    }
    await queue.resume();
    await waitForCondition(
      async () =>
        (await state().current(org, 'project', failed.id))?.projectionStatus ===
        'failed',
      '10회 소진 failed를 확인하지 못했습니다.',
      { timeoutMs: 30_000 },
    );
    expect(
      (await state().current(org, 'project', healthy.id))?.appliedSeq,
    ).toBe(1);
    expect(
      fail.mock.calls.filter(([source]) => source.aggregateId === failed.id),
    ).toHaveLength(10);
    const before = await state().current(org, 'project', failed.id);
    for (let i = 0; i < 3; i++) {
      await agePending(org);
      await tick();
    }
    expect(await state().current(org, 'project', failed.id)).toMatchObject({
      desiredSeq: before?.desiredSeq,
      projectionStatus: 'failed',
      requeueCount: 0,
    });
    expect(
      fail.mock.calls.filter(([source]) => source.aggregateId === failed.id),
    ).toHaveLength(10);
    fail.mockRestore();
    await jobs
      .get(ProjectRepository)
      .updateProject(org, failed.id, { name: '새 변경으로 재접수' });
    await converged(org);
    expect((await state().current(org, 'project', failed.id))?.desiredSeq).toBe(
      2,
    );
  });

  it('F-04 Better Auth role·탈퇴·재가입 의도 유실은 applied membership 관찰로 복구한다', async () => {
    const owner = await actor();
    const org = await createOrganization(owner);
    const participant = await actor();
    const joined = await auth().api.addMember({
      body: { organizationId: org, userId: participant.userId, role: 'member' },
    });
    if (!joined) throw new Error('가입 결과가 없습니다.');
    jest
      .spyOn(jobs.get(KnowledgeGraphMembershipBridge), 'record')
      .mockResolvedValue(undefined);
    await due('organizations');
    await jobs.get(KnowledgeGraphReconciliationService).discoverOrganizations();
    await tick();
    await queue.resume();
    await converged(org, 2);
    const observe = async () => {
      await database
        .update(outboxAggregateVersion)
        .set({ updatedAt: new Date(0) })
        .where(
          and(
            eq(outboxAggregateVersion.organizationId, org),
            eq(outboxAggregateVersion.aggregateKind, 'membership'),
          ),
        );
      await due('membership_sources');
      await tick();
      await converged(org, 2);
    };
    const key = JSON.stringify(['membership', org, participant.userId]);
    await auth().api.updateMemberRole({
      headers: owner.headers,
      body: { organizationId: org, memberId: joined.id, role: 'admin' },
    });
    await observe();
    expect(
      await graph.query(
        'MATCH (node:KGWorkOSMembership {key:$key}) RETURN node.role AS role, node.deleted AS deleted',
        { key },
      ),
    ).toEqual([{ role: 'admin', deleted: false }]);
    await auth().api.removeMember({
      headers: owner.headers,
      body: { organizationId: org, memberIdOrEmail: joined.id },
    });
    await observe();
    expect(
      await graph.query(
        'MATCH (node:KGWorkOSMembership {key:$key}) OPTIONAL MATCH (node)-[relation]->() RETURN node.deleted AS deleted, count(relation) AS relations',
        { key },
      ),
    ).toEqual([{ deleted: true, relations: '0' }]);
    await auth().api.addMember({
      body: { organizationId: org, userId: participant.userId, role: 'member' },
    });
    await observe();
    expect(
      await graph.query(
        'MATCH (node:KGWorkOSMembership {key:$key}) RETURN node.role AS role, node.deleted AS deleted',
        { key },
      ),
    ).toEqual([{ role: 'member', deleted: false }]);
    expect(
      (await state().current(org, 'membership', participant.userId))
        ?.desiredSeq,
    ).toBe(4);
  });

  it('F-05 실제 조직 삭제 cascade는 모든 tracked 원본을 tombstone하고 조직 B를 보존한다', async () => {
    const owner = await actor();
    const org = await createOrganization(owner);
    const other = await createOrganization(owner);
    await createWiki(other, owner.userId, 'B 보존');
    const wiki = await createWiki(org, owner.userId);
    const project = await createProject(org, owner.userId);
    const columns = await jobs
      .get(ProjectColumnRepository)
      .listColumns(org, project.id);
    if (!columns?.[0]) throw new Error('컬럼이 없습니다.');
    await jobs
      .get(TicketRepository)
      .createTicketWithNumber(org, project.id, owner.userId, {
        title: '조직 삭제 티켓',
        columnId: columns[0].id,
      });
    await jobs.get(CalendarSchedulingRepository).scheduleMeeting(
      org,
      owner.userId,
      {
        title: '조직 삭제 회의',
        category: 'team',
        startAt: '2030-01-01T00:00:00Z',
        endAt: '2030-01-01T01:00:00Z',
        timeZone: 'UTC',
        locationType: 'online',
        attendeeUserIds: [],
      },
      [],
      [
        {
          startAt: new Date('2030-01-01T00:00:00Z'),
          endAt: new Date('2030-01-01T01:00:00Z'),
          recurrenceOriginalStartAt: null,
        },
      ],
      null,
      randomUUID(),
    );
    const curated = jobs.get(CuratedGraphService);
    const node = await curated.createNode(org, owner.userId, {
      kind: 'custom',
      title: '조직 삭제 curated',
    });
    await curated.createEdge(org, owner.userId, {
      sourceNodeId: node.id,
      targetNodeId: wiki.id,
      targetNodeKind: 'wiki_document',
      predicate: 'references',
    });
    await due('organizations');
    await jobs.get(KnowledgeGraphReconciliationService).discoverOrganizations();
    await tick();
    await queue.resume();
    await converged(org, 7);
    await converged(other, 2);
    const beforeOther = await rows(other);
    const graphBefore = await graph.query(
      'MATCH (node) WHERE node.organizationId=$org RETURN node.key AS key, node.deleted AS deleted ORDER BY key',
      { org: other },
    );
    await auth().api.deleteOrganization({
      headers: owner.headers,
      body: { organizationId: org },
    });
    await due('organization_presence');
    await tick();
    await converged(org);
    expect((await rows(org)).every(({ deleted }) => deleted)).toBe(true);
    expect(
      await database
        .select()
        .from(reconciliationScope)
        .where(eq(reconciliationScope.organizationId, org)),
    ).toEqual([]);
    expect(
      await graph.query(
        'MATCH (node) WHERE node.organizationId=$org AND (node:KGWorkOSWikiDocument OR node:KGWorkOSProject OR node:KGWorkOSTicket OR node:KGWorkOSMeeting OR node:KGCuratedNode OR node:KGWorkOSMembership) AND coalesce(node.deleted,false)=false RETURN count(node) AS active',
        { org },
      ),
    ).toEqual([{ active: '0' }]);
    expect(await rows(other)).toEqual(beforeOther);
    expect(
      await graph.query(
        'MATCH (node) WHERE node.organizationId=$org RETURN node.key AS key, node.deleted AS deleted ORDER BY key',
        { org: other },
      ),
    ).toEqual(graphBefore);
  });

  it('F-06 실제 registry 10조직의 존재 조회 이상치는 tombstone 0과 고정 오류를 남긴다', async () => {
    const owner = await actor();
    for (let i = 0; i < 10; i++) {
      const org = await createOrganization(owner);
      await createProject(org, owner.userId);
    }
    await queue.resume();
    for (const org of organizations) await converged(org, 1);
    const sources = jobs.get(WorkosSourceProvider);
    jest.spyOn(sources, 'existingOrganizationIds').mockResolvedValue([]);
    await due('organization_presence');
    await tick();
    const [presence] = await database
      .select()
      .from(reconciliationScope)
      .where(eq(reconciliationScope.id, 'organization_presence'));
    expect(presence).toMatchObject({
      lastError: 'KNOWLEDGE_GRAPH_ORGANIZATION_PRESENCE_ANOMALY',
      failureCount: 1,
    });
    for (const org of organizations)
      expect((await rows(org)).every(({ deleted }) => !deleted)).toBe(true);
  });

  it('membership 1K의 실제 Better Auth 관찰은 의도가 없으면 seq를 유지하고 순환한다', async () => {
    const owner = await actor();
    const org = await createOrganization(owner);
    const runId = randomUUID();
    const createdAt = new Date('2026-10-01T00:00:00Z');
    const users = Array.from(
      { length: 1000 },
      (_, index): typeof user.$inferInsert => ({
        id: `kg-p6-observe-${runId}-${index}`,
        name: '관찰 처리량 사용자',
        email: `kg-p6-observe-${runId}-${index}@example.test`,
      }),
    );
    for (const row of users) actors.add(row.id);
    await database.insert(user).values(users);
    const memberships = users.map((row, index): typeof member.$inferInsert => ({
      id: `kg-p6-member-${runId}-${index}`,
      userId: row.id,
      organizationId: org,
      role: 'member',
      createdAt,
    }));
    await database.insert(member).values(memberships);
    await database.insert(outboxAggregateVersion).values(
      memberships.map((row): typeof outboxAggregateVersion.$inferInsert => ({
        organizationId: org,
        aggregateKind: 'membership',
        aggregateId: row.userId,
        desiredSeq: 1,
        appliedSeq: 1,
        projectionStatus: 'applied',
        updatedAt: new Date(0),
        appliedSnapshotDigest: digestGraphJson({
          id: row.id,
          organizationId: org,
          userId: row.userId,
          role: 'member',
          createdAt: createdAt.toISOString(),
        }),
      })),
    );
    const observed = jest.spyOn(
      jobs.get(WorkosSourceProvider),
      'observeMembershipSnapshot',
    );
    await due('membership_sources');
    const startedAt = Date.now();
    await tick();
    expect(observed).toHaveBeenCalledTimes(1000);
    expect(
      (await rows(org)).every(
        ({ desiredSeq, appliedSeq }) => desiredSeq === 1 && appliedSeq === 1,
      ),
    ).toBe(true);
    const [scope] = await database
      .select()
      .from(reconciliationScope)
      .where(eq(reconciliationScope.id, 'membership_sources'));
    expect(scope).toMatchObject({
      afterOrganizationId: null,
      afterAggregateId: null,
      leaseToken: null,
    });
    console.info(
      JSON.stringify({
        scenario: 'membership-1K',
        sources: 1000,
        elapsedMs: Date.now() - startedAt,
      }),
    );
  });

  async function historical(org: string, actorId: string, total: number) {
    const inserted = await database
      .insert(project)
      .values(
        Array.from({ length: total }, (_, i) => ({
          id: `10000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
          organizationId: org,
          key: `H${i}`,
          name: `과거 ${i}`,
          createdByUserId: actorId,
        })),
      )
      .returning();
    await due('organizations');
    await jobs.get(KnowledgeGraphReconciliationService).discoverOrganizations();
    return inserted;
  }

  it('조직 삭제 1K 원본의 tombstone 의도와 실제 Neo4j 적용 처리량을 측정한다', async () => {
    const owner = await actor();
    const org = await createOrganization(owner);
    await historical(org, owner.userId, 1000);
    await tick();
    await queue.resume();
    await converged(org, 1001);
    await auth().api.deleteOrganization({
      headers: owner.headers,
      body: { organizationId: org },
    });
    await due('organization_presence');
    const startedAt = Date.now();
    await tick();
    await converged(org, 1001);
    expect((await rows(org)).every(({ deleted }) => deleted)).toBe(true);
    expect(
      await graph.query(
        'MATCH (node:KGWorkOSProject) WHERE node.organizationId=$org AND node.deleted=false RETURN count(node) AS active',
        { org },
      ),
    ).toEqual([{ active: '0' }]);
    console.info(
      JSON.stringify({
        scenario: 'organization-delete-1K',
        sources: 1001,
        elapsedMs: Date.now() - startedAt,
      }),
    );
  });

  it('F-07 초기 이벤트 없는 Project 1K를 접수하고 동시 owner 변경·Wiki 삭제가 최종 승리한다', async () => {
    const owner = await actor();
    const org = await createOrganization(owner);
    const historicalRows = await historical(org, owner.userId, 1000);
    const wiki = await createWiki(org, owner.userId, 'backfill 중 삭제');
    const scopes = jobs.get(KnowledgeGraphReconciliationService);
    const startedAt = Date.now();
    for (let i = 0; i < 10; i++) {
      await scopes.discoverOwnerSources();
      if (
        (await rows(org)).some(
          ({ aggregateKind }) => aggregateKind === 'project',
        )
      )
        break;
    }
    const updated = historicalRows[0];
    if (!updated) throw new Error('초기 원본이 없습니다.');
    await jobs.get(ProjectRepository).updateProject(org, updated.id, {
      name: 'live 변경 최종',
      archived: false,
    });
    await jobs.get(WikiRepository).deleteDocument(org, wiki.id);
    for (let i = 0; i < 3; i++) await tick();
    await queue.resume();
    await converged(org, 1002);
    const projects = (await rows(org)).filter(
      ({ aggregateKind }) => aggregateKind === 'project',
    );
    expect(projects).toHaveLength(1000);
    expect(projects.filter(({ desiredSeq }) => desiredSeq > 1)).toHaveLength(1);
    expect(
      await graph.query(
        'MATCH (node:KGWorkOSProject) WHERE node.organizationId=$org RETURN count(node) AS nodes, count(DISTINCT node.key) AS uniqueNodes',
        { org },
      ),
    ).toEqual([{ nodes: '1000', uniqueNodes: '1000' }]);
    expect(
      await graph.query(
        'MATCH (node:KGWorkOSProject {key:$key}) RETURN node.name AS name',
        { key: JSON.stringify(['project', org, updated.id]) },
      ),
    ).toEqual([{ name: 'live 변경 최종' }]);
    expect(
      (await state().current(org, 'wiki_document', wiki.id))?.deleted,
    ).toBe(true);
    console.info(
      JSON.stringify({
        scenario: 'F-07',
        sources: 1000,
        elapsedMs: Date.now() - startedAt,
      }),
    );
  });

  it('F-08 Jobs 재기동은 저장 cursor를 이어가며 접수한 seq를 증가시키지 않는다', async () => {
    const owner = await actor();
    const org = await createOrganization(owner);
    await historical(org, owner.userId, 250);
    const recovery = jobs.get(KnowledgeGraphReconciliationService);
    for (let i = 0; i < 10; i++) {
      await recovery.discoverOwnerSources();
      if (
        (await rows(org)).some(
          ({ aggregateKind }) => aggregateKind === 'project',
        )
      )
        break;
    }
    const before = (await rows(org)).filter(
      ({ aggregateKind }) => aggregateKind === 'project',
    );
    expect(before).toHaveLength(100);
    const [cursor] = await database
      .select()
      .from(reconciliationScope)
      .where(
        and(
          eq(reconciliationScope.organizationId, org),
          eq(reconciliationScope.aggregateKind, 'project'),
        ),
      );
    expect(cursor?.afterAggregateId).toBeTruthy();
    await scheduler().onModuleDestroy();
    await relay().stop();
    const previous = jobs;
    jobs = await startJobs();
    database = jobs.get(DatabaseService).db;
    await previous.close();
    contexts.delete(previous);
    await tick();
    await queue.resume();
    await converged(org, 251);
    const after = await rows(org);
    for (const row of before)
      expect(
        after.find(({ aggregateId }) => aggregateId === row.aggregateId)
          ?.desiredSeq,
      ).toBe(row.desiredSeq);
    expect(
      after.filter(({ aggregateKind }) => aggregateKind === 'project'),
    ).toHaveLength(250);
  });

  it('F-09 두 실제 Jobs는 pending 200 재예약과 owner 접수를 분할해 중복 없이 수렴한다', async () => {
    const owner = await actor();
    const org = await createOrganization(owner);
    await historical(org, owner.userId, 200);
    const second = await startJobs();
    await Promise.all([tick(), tick(second)]);
    await publishAll(200);
    await relay().stop();
    await relay(second).stop();
    await queue.obliterate({ force: true });
    await agePending(org);
    const firstPublisher = jobs
      .select(KnowledgeGraphJobsModule)
      .get(OutboxAggregateChangePublisher, { strict: true });
    const secondPublisher = second
      .select(KnowledgeGraphJobsModule)
      .get(OutboxAggregateChangePublisher, { strict: true });
    const first = jest.spyOn(firstPublisher, 'requeueCurrent');
    const other = jest.spyOn(secondPublisher, 'requeueCurrent');
    await Promise.all([tick(), tick(second)]);
    const sourceIds = [...first.mock.calls, ...other.mock.calls]
      .filter(([, source]) => source.aggregateKind === 'project')
      .map(([, source]) => source.aggregateId);
    expect(sourceIds).toHaveLength(200);
    expect(new Set(sourceIds).size).toBe(200);
    relay().start();
    relay(second).start();
    await queue.resume();
    await converged(org, 201);
    expect((await rows(org)).every(({ desiredSeq }) => desiredSeq === 1)).toBe(
      true,
    );
    expect((await relay().stats()).deadLetters).toBe(0);
  });
});
