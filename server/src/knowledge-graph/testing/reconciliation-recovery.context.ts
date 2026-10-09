import { randomUUID } from 'node:crypto';

import { OutboxRelay } from '@nestjs/outbox';
import { Test, type TestingModule } from '@nestjs/testing';

import { createNeo4jGraph } from '@repo/knowledge-graph';
import type { Auth } from '@/auth/auth';
import {
  organization,
  user,
} from '@/auth/infrastructure/persistence/drizzle/generated/auth.schema';
import { CalendarDrizzlePersistenceModule } from '@/calendar/infrastructure/persistence/drizzle/drizzle-persistence.module';
import { DatabaseService } from '@/database/database.service';
import { JobsModule } from '@/jobs/jobs.module';
import { KnowledgeGraphJobsModule } from '@/jobs/knowledge-graph/knowledge-graph-jobs.module';
import { KNOWLEDGE_GRAPH_PROJECTION_QUEUE } from '@/jobs/knowledge-graph/knowledge-graph-projection.job';
import { KnowledgeGraphProjectionProcessor } from '@/jobs/knowledge-graph/knowledge-graph-projection.processor';
import { KnowledgeGraphReconciliationScheduler } from '@/jobs/knowledge-graph/knowledge-graph-reconciliation.scheduler';
import knowledgeGraphConfig from '@/knowledge-graph/config/knowledge-graph.config';
import { CuratedGraphModule } from '@/knowledge-graph/curated-graph.module';
import { reconciliationScope } from '@/knowledge-graph/infrastructure/persistence/drizzle/schema/reconciliation-scope.schema';
import { WorkosSourceProvider } from '@/knowledge-graph/infrastructure/source/workos-source.provider';
import { KnowledgeGraphReconciliationService } from '@/knowledge-graph/knowledge-graph-reconciliation.service';
import { outboxAggregateVersion } from '@/outbox/infrastructure/persistence/drizzle/schema/outbox-aggregate-version.schema';
import { OutboxAggregateProjectionState } from '@/outbox/outbox-aggregate-projection-state';
import { ProjectDrizzlePersistenceModule } from '@/projects/infrastructure/persistence/drizzle/drizzle-persistence.module';
import { project } from '@/projects/infrastructure/persistence/drizzle/schema/project.schema';
import { ProjectRepository } from '@/projects/infrastructure/persistence/project.repository';
import { createRedisOptions } from '@/queue/queue.config';
import { waitForCondition } from '@/testing/wait-for-condition';
import { WikiDrizzlePersistenceModule } from '@/wiki/infrastructure/persistence/drizzle/drizzle-persistence.module';
import { WikiRepository } from '@/wiki/infrastructure/persistence/wiki.repository';

import { AuthService } from '@thallesp/nestjs-better-auth';
import { Queue } from 'bullmq';
import { and, eq, inArray, lt } from 'drizzle-orm';
import * as Y from 'yjs';

// 각 suite 호출마다 별도 context를 만든다. 전역 scope를 공유하므로 runner의 직렬 실행을 유지한다.
export function createReconciliationRecoveryContext() {
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
  const sources = () =>
    jobs
      .select(KnowledgeGraphJobsModule)
      .get(WorkosSourceProvider, { strict: true });
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
    // 조직에 귀속되지 않는 전역 cursor는 각 복구 시나리오가 독립적으로 소유한다.
    await database
      .delete(reconciliationScope)
      .where(
        inArray(reconciliationScope.id, [
          'organizations',
          'membership_sources',
          'organization_presence',
        ]),
      );
    await jobs.get(KnowledgeGraphReconciliationService).initialize();
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
  async function restartJobs() {
    const previous = jobs;
    jobs = await startJobs();
    database = jobs.get(DatabaseService).db;
    await previous.close();
    contexts.delete(previous);
  }
  return {
    get jobs() {
      return jobs;
    },
    get database() {
      return database;
    },
    get graph() {
      return graph;
    },
    get queue() {
      return queue;
    },
    get organizations() {
      return organizations;
    },
    get actors() {
      return actors;
    },
    startJobs,
    relay,
    state,
    sources,
    scheduler,
    auth,
    actor,
    createOrganization,
    createWiki,
    createProject,
    rows,
    converged,
    tick,
    due,
    publishAll,
    agePending,
    historical,
    restartJobs,
  };
}
