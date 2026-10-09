import { randomUUID } from 'node:crypto';

import { ConfigService } from '@nestjs/config';

import { DatabaseService } from '@/database/database.service';
import { semanticPipelineFingerprint } from '@/knowledge-graph/domain/semantic-pipeline';
import { outboxAggregateVersion } from '@/outbox/infrastructure/persistence/drizzle/schema/outbox-aggregate-version.schema';
import { outboxSemanticSourceState } from '@/outbox/infrastructure/persistence/drizzle/schema/outbox-semantic-source-state.schema';
import { OutboxAggregateProjectionState } from '@/outbox/outbox-aggregate-projection-state';
import { OutboxSemanticRecovery } from '@/outbox/outbox-semantic-recovery';

import { eq, inArray } from 'drizzle-orm';

const describeIsolated =
  process.env.KG_TEST_ALLOW_WRITE === '1' &&
  process.env.DATABASE_URL &&
  new URL(process.env.DATABASE_URL).pathname === '/graph_p8_a5'
    ? describe
    : describe.skip;

describeIsolated('R8-16 조직별 projection/semantic 집계', () => {
  const prefix = `kg-p8-a5-progress-${randomUUID().slice(0, 8)}`;
  const orgA = `${prefix}-a`;
  const orgB = `${prefix}-b`;
  let database: DatabaseService;
  let projection: OutboxAggregateProjectionState;
  let semantic: OutboxSemanticRecovery;

  beforeAll(() => {
    database = new DatabaseService(
      new ConfigService({ database: { url: process.env.DATABASE_URL } }),
    );
    projection = new OutboxAggregateProjectionState(database);
    semantic = new OutboxSemanticRecovery(database);
  });

  afterAll(async () => {
    await database.db
      .delete(outboxAggregateVersion)
      .where(inArray(outboxAggregateVersion.organizationId, [orgA, orgB]));
    await database.onApplicationShutdown();
  });

  async function addVersion(
    organizationId: string,
    id: string,
    values: Partial<typeof outboxAggregateVersion.$inferInsert> = {},
  ) {
    await database.db.insert(outboxAggregateVersion).values({
      organizationId,
      aggregateKind: 'wiki_document',
      aggregateId: id,
      desiredSeq: 2,
      appliedSeq: 1,
      projectionStatus: 'pending',
      ...values,
    });
  }

  async function addSemantic(
    id: string,
    values: Partial<typeof outboxSemanticSourceState.$inferInsert>,
  ) {
    await database.db.insert(outboxSemanticSourceState).values({
      organizationId: orgA,
      aggregateKind: 'wiki_document',
      aggregateId: id,
      ...values,
    });
  }

  it('R8-16 projection 집계는 deleted와 다른 조직을 제외해 row-wise 결과와 일치한다', async () => {
    const old = new Date(Date.now() - 30_000);
    await addVersion(orgA, `${prefix}-p1`, { updatedAt: old });
    await addVersion(orgA, `${prefix}-p2`);
    await addVersion(orgA, `${prefix}-failed`, {
      projectionStatus: 'failed',
      lastError: 'x',
    });
    await addVersion(orgA, `${prefix}-applied`, {
      desiredSeq: 2,
      appliedSeq: 2,
      projectionStatus: 'applied',
    });
    await addVersion(orgA, `${prefix}-deleted`, { deleted: true });
    for (let index = 0; index < 4; index += 1) {
      await addVersion(orgB, `${prefix}-other-${index}`);
    }

    const result = await projection.organizationProgress(orgA, []);
    expect(result.pending).toBe(2);
    expect(result.failed).toBe(1);
    expect(result.oldestPendingAt?.getTime()).toBeLessThanOrEqual(
      Date.now() - 20_000,
    );
  });

  it('R8-16 semantic 조직 집계는 P7 gap/terminal/running/manual 정의와 다른 조직 격리를 지킨다', async () => {
    await database.db
      .delete(outboxAggregateVersion)
      .where(inArray(outboxAggregateVersion.organizationId, [orgA, orgB]));

    const ids = {
      notIndexed: `${prefix}-s-not-indexed`,
      waiting: `${prefix}-s-waiting`,
      accepted: `${prefix}-s-accepted`,
      queued: `${prefix}-s-queued`,
      running: `${prefix}-s-running`,
      stale: `${prefix}-s-stale`,
      failed: `${prefix}-s-failed`,
      upToDate: `${prefix}-s-up-to-date`,
    };
    for (const id of Object.values(ids)) {
      await addVersion(orgA, id, {
        desiredSeq: 2,
        appliedSeq: 2,
        projectionStatus: 'applied',
      });
    }

    const generation = () => randomUUID();
    const recent = new Date();
    const old = new Date(Date.now() - 600_000);
    const fingerprint = semanticPipelineFingerprint;

    await addSemantic(ids.notIndexed, {
      indexedSeq: 2,
      indexedFingerprint: fingerprint,
      activeGenerationId: null,
    });
    await addSemantic(ids.waiting, {
      indexedSeq: 1,
      indexedFingerprint: fingerprint,
      observedSeq: 2,
      observedAt: recent,
    });
    await addSemantic(ids.accepted, {
      indexedSeq: 2,
      indexedFingerprint: fingerprint,
      activeGenerationId: generation(),
      manualRequestSeq: 1,
      manualRequestId: randomUUID(),
      manualRequestedAt: old,
      manualDeliveredSeq: 0,
      indexedManualSeq: 0,
    });
    await addSemantic(ids.queued, {
      indexedSeq: 2,
      indexedFingerprint: fingerprint,
      activeGenerationId: generation(),
      manualRequestSeq: 1,
      manualRequestId: randomUUID(),
      manualRequestedAt: recent,
      manualDeliveredSeq: 1,
      indexedManualSeq: 0,
    });
    await addSemantic(ids.running, {
      indexedSeq: 1,
      indexedFingerprint: fingerprint,
      activeGenerationId: generation(),
      runStatus: 'running',
      leaseToken: randomUUID(),
      leaseExpiresAt: new Date(Date.now() + 60_000),
    });
    await addSemantic(ids.stale, {
      indexedSeq: 1,
      indexedFingerprint: fingerprint,
      activeGenerationId: generation(),
      observedSeq: 2,
      observedAt: old,
    });
    await addSemantic(ids.failed, {
      indexedSeq: 1,
      indexedFingerprint: fingerprint,
      activeGenerationId: generation(),
      runStatus: 'failed',
      attemptSeq: 2,
      attemptFingerprint: fingerprint,
      lastErrorCode: 'SEMANTIC_INTERNAL',
    });
    await addSemantic(ids.upToDate, {
      indexedSeq: 2,
      indexedFingerprint: fingerprint,
      activeGenerationId: generation(),
    });

    for (let index = 0; index < 3; index += 1) {
      const id = `${prefix}-other-semantic-${index}`;
      await addVersion(orgB, id, { desiredSeq: 9, appliedSeq: 0 });
      await database.db.insert(outboxSemanticSourceState).values({
        organizationId: orgB,
        aggregateKind: 'wiki_document',
        aggregateId: id,
        indexedSeq: 0,
      });
    }

    const result = await semantic.organizationStats(orgA, fingerprint);
    expect(result).toMatchObject({
      notIndexed: 1,
      waiting: 1,
      accepted: 1,
      queued: 1,
      running: 1,
      stale: 1,
      failed: 1,
      upToDate: 1,
    });
    expect(result.pending).toBe(4);
    expect(result.oldestAcceptedAt?.getTime()).toBe(old.getTime());
  });
});
