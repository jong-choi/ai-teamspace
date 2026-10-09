import { randomUUID } from 'node:crypto';

import { Test, type TestingModule } from '@nestjs/testing';

import { DatabaseService } from '@/database/database.service';
import { databaseSchema } from '@/database/schema';
import { outboxAggregateVersion as version } from '@/outbox/infrastructure/persistence/drizzle/schema/outbox-aggregate-version.schema';
import { outboxSemanticSourceState as state } from '@/outbox/infrastructure/persistence/drizzle/schema/outbox-semantic-source-state.schema';
import { OutboxSemanticRecovery } from '@/outbox/outbox-semantic-recovery';

import { eq, type Logger } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { z } from 'zod';

const describeIsolated =
  process.env.KG_TEST_ALLOW_WRITE === '1' &&
  process.env.DATABASE_URL &&
  new URL(process.env.DATABASE_URL).pathname === '/graph_p7_semantic'
    ? describe
    : describe.skip;

describeIsolated('실제1만 원본의 의미 gap 발견과 PG 실행 계획', () => {
  jest.setTimeout(60_000);
  const org = `p7-performance-${randomUUID()}`;
  let pool: Pool;
  let db: DatabaseService['db'];
  let app: TestingModule;
  const queries: Parameters<Logger['logQuery']>[] = [];
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
    app = await Test.createTestingModule({
      providers: [
        OutboxSemanticRecovery,
        { provide: DatabaseService, useValue: { db } },
      ],
    }).compile();
    for (let batch = 0; batch < 10; batch++) {
      await db.insert(version).values(
        Array.from({ length: 1000 }, () => ({
          organizationId: org,
          aggregateKind: 'wiki_document' as const,
          aggregateId: randomUUID(),
          desiredSeq: 1,
        })),
      );
    }
  });
  afterAll(async () => {
    if (db) await db.delete(version).where(eq(version.organizationId, org));
    await app?.close();
    await pool?.end();
  });
  it('R7-19·F7-19 실제1만 행을 발견하고 현재 claim SQL의 EXPLAIN ANALYZE·시간·행 수를 기록한다', async () => {
    const recovery = app.get(OutboxSemanticRecovery);
    const started = performance.now();
    expect(await recovery.discoverMissing(10_000)).toBe(10_000);
    const discoverMs = performance.now() - started;
    expect(
      await db
        .select({ id: state.aggregateId })
        .from(state)
        .where(eq(state.organizationId, org)),
    ).toHaveLength(10_000);
    queries.length = 0;
    const claimedAt = performance.now();
    const claimed = await recovery.claimGapBatch(25, 'a'.repeat(64));
    const claimMs = performance.now() - claimedAt;
    expect(claimed).toHaveLength(25);
    const selection = queries.find(
      ([query]) =>
        query.startsWith('select') &&
        query.includes('"outbox_semantic_source_state"') &&
        query.includes('inner join') &&
        query.includes('order by') &&
        !query.includes('for update'),
    );
    if (!selection)
      throw new Error('실제 claim의 ORM SQL을 관찰하지 못했습니다.');
    // ORM이 실행한 SELECT의 운영 진단만 수행한다. hand-written CRUD SQL은 만들지 않는다.
    const result = await pool.query(
      'EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ' + selection[0],
      selection[1],
    );
    const rows = z
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
      .parse(result.rows);
    const explain = rows[0]?.['QUERY PLAN'][0];
    if (!explain) throw new Error('PG 실행 계획이 없습니다.');
    console.info(
      JSON.stringify({
        acceptance: 'R7-19/F7-19',
        sources: 10_000,
        discoverMs,
        claimMs,
        explain,
      }),
    );
    expect(Number(explain.Plan['Actual Rows'])).toBe(25);
  });
});
