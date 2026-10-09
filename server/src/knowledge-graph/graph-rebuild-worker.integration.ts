import { randomUUID } from 'node:crypto';

import { ConfigService } from '@nestjs/config';

import {
  organization,
  user,
} from '@/auth/infrastructure/persistence/drizzle/generated/auth.schema';
import { DatabaseService } from '@/database/database.service';
import { semanticPipelineFingerprint } from '@/knowledge-graph/domain/semantic-pipeline';
import { GraphRebuildWorkflowService } from '@/knowledge-graph/graph-rebuild-workflow.service';
import { GraphRebuildWorkerDrizzleRepository } from '@/knowledge-graph/infrastructure/persistence/drizzle/repositories/graph-rebuild-worker.repository';
import { graphRebuildRequest } from '@/knowledge-graph/infrastructure/persistence/drizzle/schema/graph-rebuild-request.schema';
import type { WorkosSourceProvider } from '@/knowledge-graph/infrastructure/source/workos-source.provider';
import type { GraphSourceAccessProvider } from '@/knowledge-graph/infrastructure/source-access/graph-source-access.provider';
import type { SemanticRefreshService } from '@/knowledge-graph/semantic-refresh.service';
import { outboxAggregateVersion } from '@/outbox/infrastructure/persistence/drizzle/schema/outbox-aggregate-version.schema';
import { OutboxAggregateChangePublisher } from '@/outbox/outbox-aggregate-change.publisher';

import { jest } from '@jest/globals';
import { and, eq } from 'drizzle-orm';

const describeIsolated =
  process.env.KG_TEST_ALLOW_WRITE === '1' &&
  process.env.DATABASE_URL &&
  new URL(process.env.DATABASE_URL).pathname === '/graph_p8_a5'
    ? describe
    : describe.skip;

describeIsolated('R8-09~13 rebuild worker PostgreSQL', () => {
  const prefix = `kg-p8-a5-worker-${randomUUID().slice(0, 8)}`;
  const organizationId = `${prefix}-org`;
  const requesterId = `${prefix}-requester`;
  let database: DatabaseService;
  const outboxAdd = jest.fn(async () => undefined);
  let publisher: OutboxAggregateChangePublisher;
  let worker: GraphRebuildWorkerDrizzleRepository;

  const semantic = {
    requestManualRefreshInTransaction: jest.fn(async () => ({
      outcome: 'accepted' as const,
      requestId: randomUUID(),
      coalesced: false,
    })),
  } as unknown as SemanticRefreshService;

  beforeAll(async () => {
    database = new DatabaseService(
      new ConfigService({ database: { url: process.env.DATABASE_URL } }),
    );
    publisher = new OutboxAggregateChangePublisher({ add: outboxAdd } as never);
    worker = new GraphRebuildWorkerDrizzleRepository(
      database,
      publisher,
      semantic,
    );
  });

  beforeEach(async () => {
    outboxAdd.mockReset();
    outboxAdd.mockResolvedValue(undefined);
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
    await database.db
      .delete(organization)
      .where(eq(organization.id, organizationId));
    await database.db.delete(user).where(eq(user.id, requesterId));
    await database.onApplicationShutdown();
  });

  async function seedRequest(
    status: 'accepted' | 'running' | 'cancel_requested' = 'accepted',
  ) {
    const [row] = await database.db
      .insert(graphRebuildRequest)
      .values({
        organizationId,
        requestedByUserId: requesterId,
        mode: 'projection_repair',
        status,
        pipelineFingerprint: semanticPipelineFingerprint,
        phase: 'projection',
        cancelRequestedAt: status === 'cancel_requested' ? new Date() : null,
      })
      .returning();
    return row!;
  }

  async function registry(id: string) {
    const [row] = await database.db
      .select()
      .from(outboxAggregateVersion)
      .where(
        and(
          eq(outboxAggregateVersion.organizationId, organizationId),
          eq(outboxAggregateVersion.aggregateKind, 'project'),
          eq(outboxAggregateVersion.aggregateId, id),
        ),
      );
    return row;
  }

  async function seedRegistry(
    id: string,
    values: Partial<typeof outboxAggregateVersion.$inferInsert> = {},
  ) {
    await database.db.insert(outboxAggregateVersion).values({
      organizationId,
      aggregateKind: 'project',
      aggregateId: id,
      desiredSeq: 1,
      ...values,
    });
  }

  it('R8-09 lease 만료 takeover는 fence+1이고 이전 token의 page·finish CAS는 0행이다', async () => {
    const request = await seedRequest();
    const oldClaim = await worker.claim(request.id);
    if (typeof oldClaim === 'string') throw new Error(oldClaim);

    await database.db
      .update(graphRebuildRequest)
      .set({ leaseExpiresAt: new Date(Date.now() - 1000) })
      .where(eq(graphRebuildRequest.id, request.id));

    const newClaim = await worker.claim(request.id);
    if (typeof newClaim === 'string') throw new Error(newClaim);
    expect(newClaim.fenceToken).toBe(oldClaim.fenceToken + 1);
    expect(newClaim.leaseToken).not.toBe(oldClaim.leaseToken);
    expect(
      await worker.commitProjectionPage(oldClaim, 'project', ['stale-page']),
    ).toBe(false);
    expect(await worker.finish(oldClaim, { status: 'succeeded' })).toBe(false);
  });

  it('R8-10 page 중간 Outbox 실패는 intent·cursor·count를 전부 rollback한다', async () => {
    const ids = [`${prefix}-rollback-a`, `${prefix}-rollback-b`];
    await Promise.all(ids.map((id) => seedRegistry(id)));
    const request = await seedRequest();
    const claim = await worker.claim(request.id);
    if (typeof claim === 'string') throw new Error(claim);

    let calls = 0;
    outboxAdd.mockImplementation(async () => {
      calls += 1;
      if (calls === 2) throw new Error('R8-10 injected Outbox failure');
    });
    await expect(
      worker.commitProjectionPage(claim, 'project', ids),
    ).rejects.toThrow('R8-10 injected Outbox failure');

    expect((await registry(ids[0]!))?.desiredSeq).toBe(1);
    expect((await registry(ids[1]!))?.desiredSeq).toBe(1);
    const [after] = await database.db
      .select()
      .from(graphRebuildRequest)
      .where(eq(graphRebuildRequest.id, request.id));
    expect(after).toMatchObject({
      cursorAfterId: null,
      pagesCommitted: 0,
      projectionIntents: 0,
    });
  });

  it('R8-11 page commit 뒤 crash/takeover는 저장 cursor 다음부터 이어지고 이전 page seq를 재증가시키지 않는다', async () => {
    const ids = [
      `${prefix}-resume-a`,
      `${prefix}-resume-b`,
      `${prefix}-resume-c`,
    ];
    await Promise.all(ids.map((id) => seedRegistry(id)));
    const request = await seedRequest();
    const first = await worker.claim(request.id);
    if (typeof first === 'string') throw new Error(first);
    expect(
      await worker.commitProjectionPage(first, 'project', ids.slice(0, 2)),
    ).toBe(true);

    await database.db
      .update(graphRebuildRequest)
      .set({ leaseExpiresAt: new Date(Date.now() - 1000) })
      .where(eq(graphRebuildRequest.id, request.id));
    const takeover = await worker.claim(request.id);
    if (typeof takeover === 'string') throw new Error(takeover);
    expect(takeover.cursorAfterId).toBe(ids[1]);
    expect(
      await worker.commitProjectionPage(takeover, 'project', [ids[2]!]),
    ).toBe(true);
    expect(
      await Promise.all(
        ids.map(async (id) => (await registry(id))?.desiredSeq),
      ),
    ).toEqual([2, 2, 2]);
  });

  it('R8-12 operator intent는 changed 구조 이벤트만 만들고 deleted skip·missing backfill·failed 재자격을 지킨다', async () => {
    const normal = `${prefix}-normal`;
    const deleted = `${prefix}-deleted`;
    const failed = `${prefix}-failed`;
    const missing = `${prefix}-missing`;
    await seedRegistry(normal);
    await seedRegistry(deleted, { deleted: true });
    await seedRegistry(failed, {
      desiredSeq: 4,
      appliedSeq: 3,
      projectionStatus: 'failed',
      lastError: 'boom',
    });

    for (const id of [normal, deleted, failed, missing]) {
      await database.runInTransaction(() =>
        publisher.recordOperatorIntent(
          database.requireTransaction(),
          organizationId,
          'project',
          id,
        ),
      );
    }

    expect(await registry(normal)).toMatchObject({
      desiredSeq: 2,
      projectionStatus: 'pending',
    });
    expect(await registry(deleted)).toMatchObject({
      desiredSeq: 1,
      deleted: true,
    });
    expect(await registry(failed)).toMatchObject({
      desiredSeq: 5,
      projectionStatus: 'pending',
      lastError: null,
    });
    expect(await registry(missing)).toMatchObject({
      desiredSeq: 1,
      projectionStatus: 'pending',
    });
    expect(outboxAdd).toHaveBeenCalledTimes(3);
    for (const call of outboxAdd.mock.calls) {
      expect(call[1]).toMatchObject({ topic: 'kg.business-source-changed.v1' });
      expect(call[1]).not.toMatchObject({
        topic: 'kg.semantic-source-changed.v1',
      });
    }
  });

  it('R8-13 cancel·조직 삭제·requester 강등은 다음 page intent 0으로 종단한다', async () => {
    const cancelled = await seedRequest('cancel_requested');
    const sources = {
      organizationExists: jest.fn(async () => true),
      listIds: jest.fn(async () => [{ id: 'must-not-run' }]),
    } as unknown as WorkosSourceProvider;
    const adminAccess = {
      isAdministrator: jest.fn(async () => true),
    } as unknown as GraphSourceAccessProvider;
    const workflow = new GraphRebuildWorkflowService(
      worker,
      sources,
      adminAccess,
      { projection: jest.fn(), semantic: jest.fn() } as never,
    );
    await expect(workflow.run(cancelled.id)).resolves.toEqual({ kind: 'done' });
    expect(sources.listIds).not.toHaveBeenCalled();
    expect(
      (
        await database.db
          .select()
          .from(graphRebuildRequest)
          .where(eq(graphRebuildRequest.id, cancelled.id))
      )[0]?.status,
    ).toBe('cancelled');

    await database.db
      .delete(graphRebuildRequest)
      .where(eq(graphRebuildRequest.organizationId, organizationId));
    const deleted = await seedRequest();
    await database.db
      .delete(organization)
      .where(eq(organization.id, organizationId));
    await expect(workflow.run(deleted.id)).resolves.toEqual({ kind: 'done' });
    expect(sources.listIds).not.toHaveBeenCalled();

    await database.db.insert(organization).values({
      id: organizationId,
      name: organizationId,
      slug: organizationId,
      createdAt: new Date(),
    });
    const demoted = await seedRequest();
    const demotedWorkflow = new GraphRebuildWorkflowService(
      worker,
      sources,
      {
        isAdministrator: jest.fn(async () => false),
      } as unknown as GraphSourceAccessProvider,
      { projection: jest.fn(), semantic: jest.fn() } as never,
    );
    await expect(demotedWorkflow.run(demoted.id)).resolves.toEqual({
      kind: 'done',
    });
    const [after] = await database.db
      .select()
      .from(graphRebuildRequest)
      .where(eq(graphRebuildRequest.id, demoted.id));
    expect(after).toMatchObject({
      status: 'failed',
      lastErrorCode: 'REBUILD_REQUESTER_FORBIDDEN',
    });
    expect(sources.listIds).not.toHaveBeenCalled();
  });
});
