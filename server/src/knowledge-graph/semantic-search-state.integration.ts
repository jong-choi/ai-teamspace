import { randomUUID } from 'node:crypto';

import { Test, type TestingModule } from '@nestjs/testing';

import { DatabaseService } from '@/database/database.service';
import { databaseSchema } from '@/database/schema';
import { semanticPipelineFingerprint } from '@/knowledge-graph/domain/semantic-pipeline';
import { OutboxSemanticSearchStateAdapter } from '@/knowledge-graph/infrastructure/persistence/outbox/outbox-semantic-search-state.adapter';
import { SemanticSearchStateRepository } from '@/knowledge-graph/infrastructure/persistence/semantic-search-state.repository';
import { describeKnowledgeGraph } from '@/knowledge-graph/testing/knowledge-graph-test-environment';
import { outboxAggregateVersion as version } from '@/outbox/infrastructure/persistence/drizzle/schema/outbox-aggregate-version.schema';
import { outboxSemanticSourceState as state } from '@/outbox/infrastructure/persistence/drizzle/schema/outbox-semantic-source-state.schema';
import { OutboxSemanticSourceState } from '@/outbox/outbox-semantic-source-state';

import { eq, type Logger } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { z } from 'zod';

describeKnowledgeGraph('R8-15 검색용 의미 상태 PostgreSQL 통합', () => {
  jest.setTimeout(90_000);

  const organizationId = `p8a3-search-${randomUUID()}`;
  const otherOrganizationId = `p8a3-other-${randomUUID()}`;
  const generationId = randomUUID();
  const now = new Date();
  const queries: Parameters<Logger['logQuery']>[] = [];
  let pool: Pool;
  let db: DatabaseService['db'];
  let moduleRef: TestingModule;
  let repository: SemanticSearchStateRepository;

  beforeAll(async () => {
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
    db = drizzle(pool, {
      schema: databaseSchema,
      logger: {
        logQuery: (...args) => {
          queries.push(args);
        },
      },
    });
    moduleRef = await Test.createTestingModule({
      providers: [
        OutboxSemanticSourceState,
        {
          provide: DatabaseService,
          useValue: { db },
        },
        {
          provide: SemanticSearchStateRepository,
          useClass: OutboxSemanticSearchStateAdapter,
        },
      ],
    }).compile();
    repository = moduleRef.get(SemanticSearchStateRepository);
  });

  afterAll(async () => {
    if (db) {
      await db
        .delete(version)
        .where(eq(version.organizationId, organizationId));
      await db
        .delete(version)
        .where(eq(version.organizationId, otherOrganizationId));
    }
    await moduleRef?.close();
    await pool?.end();
  });

  it('조직·삭제·active generation·fingerprint 조건을 적용하고 currentBatch는 현재 registry 상태를 함께 반환한다', async () => {
    const searchableId = randomUUID();
    const deletedId = randomUUID();
    const wrongFingerprintId = randomUUID();
    const noGenerationId = randomUUID();
    const otherOrgId = randomUUID();
    const noStateId = randomUUID();

    await db.insert(version).values([
      {
        organizationId,
        aggregateKind: 'wiki_document',
        aggregateId: searchableId,
        desiredSeq: 3,
        appliedSeq: 3,
      },
      {
        organizationId,
        aggregateKind: 'wiki_document',
        aggregateId: deletedId,
        desiredSeq: 2,
        deleted: true,
      },
      {
        organizationId,
        aggregateKind: 'wiki_document',
        aggregateId: wrongFingerprintId,
        desiredSeq: 1,
      },
      {
        organizationId,
        aggregateKind: 'wiki_document',
        aggregateId: noGenerationId,
        desiredSeq: 1,
      },
      {
        organizationId,
        aggregateKind: 'wiki_document',
        aggregateId: noStateId,
        desiredSeq: 7,
      },
      {
        organizationId: otherOrganizationId,
        aggregateKind: 'wiki_document',
        aggregateId: otherOrgId,
        desiredSeq: 1,
      },
    ]);
    await db.insert(state).values([
      searchableState(
        organizationId,
        searchableId,
        semanticPipelineFingerprint,
      ),
      searchableState(organizationId, deletedId, semanticPipelineFingerprint),
      searchableState(organizationId, wrongFingerprintId, 'f'.repeat(64)),
      {
        ...searchableState(
          organizationId,
          noGenerationId,
          semanticPipelineFingerprint,
        ),
        activeGenerationId: null,
      },
      searchableState(
        otherOrganizationId,
        otherOrgId,
        semanticPipelineFingerprint,
      ),
    ]);

    expect(
      await repository.listSearchableSources(
        organizationId,
        semanticPipelineFingerprint,
        100,
      ),
    ).toEqual([
      expect.objectContaining({
        aggregateId: searchableId,
        deleted: false,
        activeGenerationId: generationId,
        indexedFingerprint: semanticPipelineFingerprint,
      }),
    ]);

    const current = await repository.currentBatch(
      organizationId,
      'wiki_document',
      [searchableId, deletedId, noStateId, otherOrgId],
    );
    expect(current).toHaveLength(3);
    expect(current).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          aggregateId: searchableId,
          desiredSeq: 3,
          deleted: false,
          activeGenerationId: generationId,
        }),
        expect.objectContaining({
          aggregateId: deletedId,
          deleted: true,
        }),
        expect.objectContaining({
          aggregateId: noStateId,
          desiredSeq: 7,
          activeGenerationId: null,
          indexedFingerprint: null,
        }),
      ]),
    );
  });

  it('1만 searchable source에서 실제 ORM 쿼리가 index를 사용하는 실행 계획을 기록한다', async () => {
    for (let batch = 0; batch < 10; batch++) {
      const ids = Array.from({ length: 1000 }, () => randomUUID());
      await db.insert(version).values(
        ids.map((aggregateId) => ({
          organizationId,
          aggregateKind: 'wiki_document' as const,
          aggregateId,
          desiredSeq: 1,
          appliedSeq: 1,
        })),
      );
      await db
        .insert(state)
        .values(
          ids.map((aggregateId) =>
            searchableState(
              organizationId,
              aggregateId,
              semanticPipelineFingerprint,
            ),
          ),
        );
    }

    queries.length = 0;
    const startedAt = performance.now();
    const rows = await repository.listSearchableSources(
      organizationId,
      semanticPipelineFingerprint,
      2_001,
    );
    const queryMs = performance.now() - startedAt;
    expect(rows).toHaveLength(2_001);

    const selection = queries.find(
      ([query]) =>
        query.startsWith('select') &&
        query.includes('"outbox_aggregate_version"') &&
        query.includes('"outbox_semantic_source_state"') &&
        query.includes('inner join') &&
        query.includes('order by'),
    );
    if (!selection)
      throw new Error('검색용 의미 상태 ORM SQL을 관찰하지 못했습니다.');

    // ORM이 실제 실행한 SELECT의 운영 진단만 수행한다. hand-written CRUD SQL은 만들지 않는다.
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
        acceptance: 'R8-15 semantic-search-state',
        sources: 10_000,
        returned: rows.length,
        queryMs,
        nodeTypes,
        planningMs: explain['Planning Time'],
        executionMs: explain['Execution Time'],
      }),
    );
    expect(nodeTypes.some((nodeType) => nodeType.includes('Index'))).toBe(true);
  });

  function searchableState(
    org: string,
    aggregateId: string,
    fingerprint: string,
  ) {
    return {
      organizationId: org,
      aggregateKind: 'wiki_document' as const,
      aggregateId,
      indexedSeq: 1,
      indexedSignature: 'a'.repeat(64),
      indexedSourceUpdatedAt: now,
      indexedFingerprint: fingerprint,
      activeGenerationId: generationId,
      lastIndexedAt: now,
    };
  }
});

function collectPlanNodeTypes(plan: Record<string, unknown>): string[] {
  const nodeTypes: string[] = [];
  const nodeType = plan['Node Type'];
  if (typeof nodeType === 'string') nodeTypes.push(nodeType);
  const childPlans = plan['Plans'];
  if (Array.isArray(childPlans)) {
    for (const child of childPlans) {
      if (typeof child === 'object' && child !== null)
        nodeTypes.push(...collectPlanNodeTypes(child));
    }
  }
  return nodeTypes;
}
