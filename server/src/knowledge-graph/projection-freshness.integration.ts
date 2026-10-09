import { randomUUID } from 'node:crypto';

import { DatabaseService } from '@/database/database.service';
import { databaseSchema } from '@/database/schema';
import { describeKnowledgeGraph } from '@/knowledge-graph/testing/knowledge-graph-test-environment';
import { outboxAggregateVersion } from '@/outbox/infrastructure/persistence/drizzle/schema/outbox-aggregate-version.schema';
import { OutboxAggregateProjectionState } from '@/outbox/outbox-aggregate-projection-state';

import { eq, type Logger } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { z } from 'zod';

describeKnowledgeGraph('R8-15 projectionFreshnessBatch PostgreSQL 통합', () => {
  jest.setTimeout(120_000);

  const organizationId = `p8a2-fresh-${randomUUID()}`;
  const queries: Parameters<Logger['logQuery']>[] = [];
  let pool: Pool;
  let db: ReturnType<typeof drizzle<typeof databaseSchema>>;
  let state: OutboxAggregateProjectionState;

  beforeAll(() => {
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
    db = drizzle(pool, {
      schema: databaseSchema,
      logger: {
        logQuery: (...args) => {
          queries.push(args);
        },
      },
    });
    state = new OutboxAggregateProjectionState({
      db,
    } as DatabaseService);
  });

  afterAll(async () => {
    if (db) {
      await db
        .delete(outboxAggregateVersion)
        .where(eq(outboxAggregateVersion.organizationId, organizationId));
    }
    await pool?.end();
  });

  it('fresh·pending·failed·deleted·missing 상태를 요청 순서대로 계산한다', async () => {
    const freshId = randomUUID();
    const pendingId = randomUUID();
    const failedId = randomUUID();
    const deletedId = randomUUID();
    const missingId = randomUUID();
    const updatedAt = new Date();

    await db.insert(outboxAggregateVersion).values([
      {
        organizationId,
        aggregateKind: 'project',
        aggregateId: freshId,
        desiredSeq: 3,
        appliedSeq: 3,
        projectionStatus: 'applied',
        updatedAt,
      },
      {
        organizationId,
        aggregateKind: 'ticket',
        aggregateId: pendingId,
        desiredSeq: 3,
        appliedSeq: 2,
        projectionStatus: 'pending',
        updatedAt,
      },
      {
        organizationId,
        aggregateKind: 'meeting',
        aggregateId: failedId,
        desiredSeq: 2,
        appliedSeq: 1,
        projectionStatus: 'failed',
        updatedAt,
      },
      {
        organizationId,
        aggregateKind: 'wiki_document',
        aggregateId: deletedId,
        desiredSeq: 4,
        appliedSeq: 4,
        deleted: true,
        projectionStatus: 'applied',
        updatedAt,
      },
    ]);

    const rows = await state.projectionFreshnessBatch(organizationId, [
      { aggregateKind: 'project', aggregateId: freshId },
      { aggregateKind: 'ticket', aggregateId: pendingId },
      { aggregateKind: 'meeting', aggregateId: failedId },
      { aggregateKind: 'wiki_document', aggregateId: deletedId },
      { aggregateKind: 'project', aggregateId: missingId },
    ]);

    expect(rows).toEqual([
      expect.objectContaining({
        kind: 'project',
        id: freshId,
        desiredSeq: 3,
        appliedSeq: 3,
        deleted: false,
        projectionStatus: 'applied',
        fresh: true,
        pending: false,
        sourceUpdatedAt: updatedAt,
      }),
      expect.objectContaining({
        kind: 'ticket',
        id: pendingId,
        desiredSeq: 3,
        appliedSeq: 2,
        projectionStatus: 'pending',
        fresh: false,
        pending: true,
      }),
      expect.objectContaining({
        kind: 'meeting',
        id: failedId,
        projectionStatus: 'failed',
        fresh: false,
        pending: true,
      }),
      expect.objectContaining({
        kind: 'wiki_document',
        id: deletedId,
        deleted: true,
        fresh: false,
        pending: true,
      }),
      {
        kind: 'project',
        id: missingId,
        desiredSeq: null,
        appliedSeq: null,
        deleted: true,
        projectionStatus: null,
        sourceUpdatedAt: null,
        fresh: false,
        pending: true,
      },
    ]);
  });

  it('1만 registry row에서도 실제 ORM freshness 조회가 primary-key index 계획을 사용한다', async () => {
    const targetIds: string[] = [];
    for (let batch = 0; batch < 10; batch++) {
      const values = Array.from({ length: 1000 }, (_, index) => {
        const aggregateId = randomUUID();
        if (batch === 9 && index >= 900) targetIds.push(aggregateId);
        return {
          organizationId,
          aggregateKind: 'project' as const,
          aggregateId,
          desiredSeq: 1,
          appliedSeq: 1,
          projectionStatus: 'applied' as const,
        };
      });
      await db.insert(outboxAggregateVersion).values(values);
    }

    queries.length = 0;
    const requested = targetIds.slice(0, 100).map((aggregateId) => ({
      aggregateKind: 'project' as const,
      aggregateId,
    }));
    const startedAt = performance.now();
    const rows = await state.projectionFreshnessBatch(
      organizationId,
      requested,
    );
    const queryMs = performance.now() - startedAt;

    expect(rows).toHaveLength(100);
    expect(rows.every((row) => row.fresh)).toBe(true);

    const selection = queries.find(
      ([query]) =>
        query.startsWith('select') &&
        query.includes('"outbox_aggregate_version"') &&
        query.includes('"organization_id"') &&
        query.includes('"aggregate_kind"') &&
        query.includes('"aggregate_id"'),
    );
    if (!selection)
      throw new Error(
        'projectionFreshnessBatch ORM SQL을 관찰하지 못했습니다.',
      );

    const result = await pool.query(
      'EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ' + selection[0],
      selection[1],
    );
    const explain = z
      .object({
        'QUERY PLAN': z.array(
          z
            .object({
              Plan: z.record(z.string(), z.json()),
              'Planning Time': z.number(),
              'Execution Time': z.number(),
            })
            .passthrough(),
        ),
      })
      .array()
      .parse(result.rows)[0]?.['QUERY PLAN'][0];
    if (!explain) throw new Error('PG 실행 계획이 없습니다.');

    const nodeTypes = collectPlanNodeTypes(explain.Plan);
    console.info(
      JSON.stringify({
        acceptance: 'R8-15 projectionFreshnessBatch',
        registryRows: 10_000,
        requested: requested.length,
        queryMs,
        nodeTypes,
        planningMs: explain['Planning Time'],
        executionMs: explain['Execution Time'],
      }),
    );
    expect(nodeTypes.some((nodeType) => nodeType.includes('Index'))).toBe(true);
  });
});

function collectPlanNodeTypes(plan: Record<string, unknown>): string[] {
  const nodeTypes: string[] = [];
  const nodeType = plan['Node Type'];
  if (typeof nodeType === 'string') nodeTypes.push(nodeType);
  const childPlans = plan['Plans'];
  if (Array.isArray(childPlans)) {
    for (const child of childPlans) {
      if (typeof child === 'object' && child !== null)
        nodeTypes.push(
          ...collectPlanNodeTypes(child as Record<string, unknown>),
        );
    }
  }
  return nodeTypes;
}
