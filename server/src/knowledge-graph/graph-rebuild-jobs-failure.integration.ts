import { randomUUID } from 'node:crypto';

import { ConfigService } from '@nestjs/config';

import {
  organization,
  user,
} from '@/auth/infrastructure/persistence/drizzle/generated/auth.schema';
import { DatabaseService } from '@/database/database.service';
import {
  KNOWLEDGE_GRAPH_REBUILD_JOB,
  KNOWLEDGE_GRAPH_REBUILD_QUEUE,
  knowledgeGraphRebuildJobId,
} from '@/jobs/knowledge-graph/knowledge-graph-rebuild.job';
import { KnowledgeGraphRebuildReconciliationScheduler } from '@/jobs/knowledge-graph/knowledge-graph-rebuild-reconciliation.scheduler';
import { deriveGraphCompleteness } from '@/knowledge-graph/domain/graph-completeness';
import { GraphRebuildRequestSchema } from '@/knowledge-graph/domain/graph-rebuild';
import { semanticPipelineFingerprint } from '@/knowledge-graph/domain/semantic-pipeline';
import { GraphRebuildWorkflowService } from '@/knowledge-graph/graph-rebuild-workflow.service';
import { GraphRebuildWorkerDrizzleRepository } from '@/knowledge-graph/infrastructure/persistence/drizzle/repositories/graph-rebuild-worker.repository';
import { graphRebuildRequest } from '@/knowledge-graph/infrastructure/persistence/drizzle/schema/graph-rebuild-request.schema';
import type { TeamspaceSourceProvider } from '@/knowledge-graph/infrastructure/source/teamspace-source.provider';
import type { GraphSourceAccessProvider } from '@/knowledge-graph/infrastructure/source-access/graph-source-access.provider';
import type { SemanticRefreshService } from '@/knowledge-graph/semantic-refresh.service';
import { describeKnowledgeGraph } from '@/knowledge-graph/testing/knowledge-graph-test-environment';
import { outboxAggregateVersion } from '@/outbox/infrastructure/persistence/drizzle/schema/outbox-aggregate-version.schema';
import { OutboxAggregateChangePublisher } from '@/outbox/outbox-aggregate-change.publisher';
import { OutboxAggregateProjectionState } from '@/outbox/outbox-aggregate-projection-state';
import { createProducerRedisOptions } from '@/queue/queue.config';

import { Queue } from 'bullmq';
import { and, eq, inArray } from 'drizzle-orm';

const redisUrl = process.env.REDIS_QUEUE_URL;

describeKnowledgeGraph('F8-06 rebuild Jobs 장애 복구 전체 흐름', () => {
  jest.setTimeout(120_000);

  const prefix = `kg-p8-a5-f806-${randomUUID().slice(0, 8)}`;
  const organizationId = `${prefix}-org`;
  const requesterId = `${prefix}-requester`;

  let database: DatabaseService;
  let workerA: GraphRebuildWorkerDrizzleRepository;
  let workerB: GraphRebuildWorkerDrizzleRepository;
  let projectionState: OutboxAggregateProjectionState;
  let queue: Queue;

  const outbox = {
    add: async () => undefined,
  } as never;
  const semantic = {
    requestManualRefreshInTransaction: async () => ({
      outcome: 'accepted' as const,
      requestId: randomUUID(),
      coalesced: false,
    }),
  } as unknown as SemanticRefreshService;

  beforeAll(() => {
    if (!redisUrl) throw new Error('격리 Redis 설정이 없습니다.');
    database = new DatabaseService(
      new ConfigService({ database: { url: process.env.DATABASE_URL } }),
    );
    const publisher = new OutboxAggregateChangePublisher(outbox);
    workerA = new GraphRebuildWorkerDrizzleRepository(
      database,
      publisher,
      semantic,
    );
    workerB = new GraphRebuildWorkerDrizzleRepository(
      database,
      publisher,
      semantic,
    );
    projectionState = new OutboxAggregateProjectionState(database);
    queue = new Queue(KNOWLEDGE_GRAPH_REBUILD_QUEUE, {
      prefix: `${prefix}:redis`,
      connection: createProducerRedisOptions(redisUrl),
    });
  });

  beforeEach(async () => {
    await queue.obliterate({ force: true });
    await database.db
      .delete(organization)
      .where(eq(organization.id, organizationId));
    await database.db.delete(user).where(eq(user.id, requesterId));
    await database.db.insert(user).values({
      id: requesterId,
      name: requesterId,
      email: `${requesterId}@example.com`,
    });
    await database.db.insert(organization).values({
      id: organizationId,
      name: organizationId,
      slug: organizationId,
      createdAt: new Date(),
    });
  });

  afterAll(async () => {
    await queue?.obliterate({ force: true });
    await queue?.close();
    await database.db
      .delete(organization)
      .where(eq(organization.id, organizationId));
    await database.db.delete(user).where(eq(user.id, requesterId));
    await database.onApplicationShutdown();
  });

  async function seedRequest(
    values: Partial<typeof graphRebuildRequest.$inferInsert> = {},
  ) {
    const [request] = await database.db
      .insert(graphRebuildRequest)
      .values({
        organizationId,
        requestedByUserId: requesterId,
        mode: 'projection_repair',
        status: 'accepted',
        pipelineFingerprint: semanticPipelineFingerprint,
        phase: 'projection',
        ...values,
      })
      .returning();
    if (!request) throw new Error('rebuild request seed failed');
    return request;
  }

  async function seedProject(id: string) {
    await database.db.insert(outboxAggregateVersion).values({
      organizationId,
      aggregateKind: 'project',
      aggregateId: id,
      desiredSeq: 1,
      appliedSeq: 1,
      projectionStatus: 'applied',
    });
  }

  async function requestRow(id: string) {
    const [row] = await database.db
      .select()
      .from(graphRebuildRequest)
      .where(eq(graphRebuildRequest.id, id));
    if (!row) throw new Error('rebuild request missing');
    return GraphRebuildRequestSchema.parse(row);
  }

  async function projectSeq(id: string) {
    const [row] = await database.db
      .select({ desiredSeq: outboxAggregateVersion.desiredSeq })
      .from(outboxAggregateVersion)
      .where(
        and(
          eq(outboxAggregateVersion.organizationId, organizationId),
          eq(outboxAggregateVersion.aggregateKind, 'project'),
          eq(outboxAggregateVersion.aggregateId, id),
        ),
      );
    return row?.desiredSeq ?? null;
  }

  it('두 worker 인스턴스에서 page commit 직후 crash 후 takeover가 fence를 올리고 저장 cursor 다음부터 이어간다', async () => {
    const ids = [`${prefix}-page-a`, `${prefix}-page-b`, `${prefix}-page-c`];
    for (const id of ids) await seedProject(id);

    const request = await seedRequest();
    const first = await workerA.claim(request.id);
    if (typeof first === 'string') throw new Error(first);
    expect(
      await workerA.commitProjectionPage(first, 'project', ids.slice(0, 2)),
    ).toBe(true);

    await database.db
      .update(graphRebuildRequest)
      .set({ leaseExpiresAt: new Date(Date.now() - 1_000) })
      .where(eq(graphRebuildRequest.id, request.id));

    const takeover = await workerB.claim(request.id);
    if (typeof takeover === 'string') throw new Error(takeover);
    expect(takeover.fenceToken).toBe(first.fenceToken + 1);
    expect(takeover.cursorAfterId).toBe(ids[1]);
    expect(
      await workerA.commitProjectionPage(first, 'project', [ids[2]!]),
    ).toBe(false);
    expect(
      await workerB.commitProjectionPage(takeover, 'project', [ids[2]!]),
    ).toBe(true);

    expect(await Promise.all(ids.map(projectSeq))).toEqual([2, 2, 2]);
  });

  it('Redis queue 상태를 유실해도 reconciliation이 PG active request에서 같은 deterministic job을 복원한다', async () => {
    const request = await seedRequest();

    await queue.add(
      KNOWLEDGE_GRAPH_REBUILD_JOB,
      { requestId: request.id },
      { jobId: knowledgeGraphRebuildJobId(request.id) },
    );
    expect(
      await queue.getJob(knowledgeGraphRebuildJobId(request.id)),
    ).not.toBeNull();

    await queue.obliterate({ force: true });
    expect(
      await queue.getJob(knowledgeGraphRebuildJobId(request.id)),
    ).toBeUndefined();

    const scheduler = new KnowledgeGraphRebuildReconciliationScheduler(
      workerB,
      queue,
    );
    expect(await scheduler.runOnce()).toBe(1);

    const restored = await queue.getJob(knowledgeGraphRebuildJobId(request.id));
    expect(restored?.name).toBe(KNOWLEDGE_GRAPH_REBUILD_JOB);
    expect(restored?.data).toEqual({ requestId: request.id });
  });

  it('cancel_requested는 다음 workflow 진입에서 page intent 없이 cancelled/complete가 아닌 degraded로 종단한다', async () => {
    const request = await seedRequest({
      status: 'cancel_requested',
      cancelRequestedAt: new Date(),
    });
    const listIds = jest.fn(async () => [{ id: `${prefix}-must-not-run` }]);
    const workflow = new GraphRebuildWorkflowService(
      workerA,
      {
        organizationExists: async () => true,
        listIds,
      } as unknown as TeamspaceSourceProvider,
      {
        isAdministrator: async () => true,
      } as unknown as GraphSourceAccessProvider,
      {
        projection: (
          ...args: Parameters<typeof projectionState.organizationProgress>
        ) => projectionState.organizationProgress(...args),
        semantic: async () => ({ pending: 0, failed: 0 }),
      } as never,
    );

    await expect(workflow.run(request.id)).resolves.toEqual({ kind: 'done' });
    expect(listIds).not.toHaveBeenCalled();

    const row = await requestRow(request.id);
    expect(row.status).toBe('cancelled');
    expect(deriveGraphCompleteness(row)).toBe('degraded');
  });

  it('catch-up 중 일부 projection 실패는 failed/degraded로 종단하고 다른 active request를 만들지 않는다', async () => {
    const failedId = `${prefix}-failed-source`;
    await database.db.insert(outboxAggregateVersion).values({
      organizationId,
      aggregateKind: 'project',
      aggregateId: failedId,
      desiredSeq: 2,
      appliedSeq: 1,
      projectionStatus: 'failed',
      lastError: 'F8-06 injected partial failure',
    });

    const request = await seedRequest({
      status: 'catching_up',
      phase: 'projection',
      catchUpStartedAt: new Date(),
    });
    const workflow = new GraphRebuildWorkflowService(
      workerB,
      {
        organizationExists: async () => true,
        listIds: async () => [],
      } as unknown as TeamspaceSourceProvider,
      {
        isAdministrator: async () => true,
      } as unknown as GraphSourceAccessProvider,
      {
        projection: (
          ...args: Parameters<typeof projectionState.organizationProgress>
        ) => projectionState.organizationProgress(...args),
        semantic: async () => ({ pending: 0, failed: 0 }),
      } as never,
    );

    await expect(workflow.run(request.id)).resolves.toEqual({ kind: 'done' });

    const row = await requestRow(request.id);
    expect(row).toMatchObject({
      status: 'failed',
      lastErrorCode: 'REBUILD_SOURCES_FAILED',
      failedSources: 1,
    });
    expect(deriveGraphCompleteness(row)).toBe('degraded');

    const active = await database.db
      .select({ id: graphRebuildRequest.id })
      .from(graphRebuildRequest)
      .where(
        and(
          eq(graphRebuildRequest.organizationId, organizationId),
          inArray(graphRebuildRequest.status, [
            'accepted',
            'running',
            'catching_up',
            'cancel_requested',
          ]),
        ),
      );
    expect(active).toHaveLength(0);
  });
});
