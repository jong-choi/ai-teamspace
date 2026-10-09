import { randomUUID } from 'node:crypto';

import { ConfigModule } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';

import { user } from '@/auth/infrastructure/persistence/drizzle/generated/auth.schema';
import databaseConfig from '@/database/config/database.config';
import { DatabaseService } from '@/database/database.service';
import { semanticRecoveryAction } from '@/knowledge-graph/domain/semantic-recovery-action';
import { outboxAggregateVersion as version } from '@/outbox/infrastructure/persistence/drizzle/schema/outbox-aggregate-version.schema';
import { outboxSemanticSourceState as state } from '@/outbox/infrastructure/persistence/drizzle/schema/outbox-semantic-source-state.schema';
import { OutboxSemanticSourceStateSelectSchema } from '@/outbox/infrastructure/persistence/drizzle/schema/outbox-semantic-source-state.zod';
import { OutboxInfrastructureModule } from '@/outbox/outbox.module';
import { OutboxSemanticManualRequest } from '@/outbox/outbox-semantic-manual-request';
import { OutboxSemanticRecovery } from '@/outbox/outbox-semantic-recovery';
import { OutboxSemanticSourceState } from '@/outbox/outbox-semantic-source-state';

import { and, eq, inArray, sql } from 'drizzle-orm';

const describeIsolated =
  process.env.KG_TEST_ALLOW_WRITE === '1' &&
  process.env.DATABASE_URL &&
  new URL(process.env.DATABASE_URL).pathname === '/graph_p7_semantic'
    ? describe
    : describe.skip;

describeIsolated('의미 색인의 PG gap 발견·분할 접수·실패 종결', () => {
  const organizationId = `p7-recovery-${randomUUID()}`;
  const actorId = `p7-recovery-actor-${randomUUID()}`;
  const fp = 'a'.repeat(64);
  let app: TestingModule;
  let database: DatabaseService['db'];
  let recovery: OutboxSemanticRecovery;
  let sourceState: OutboxSemanticSourceState;
  let manual: OutboxSemanticManualRequest;
  const scope = (aggregateId = randomUUID()) =>
    ({ organizationId, aggregateKind: 'wiki_document', aggregateId }) as const;

  beforeAll(async () => {
    app = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, load: [databaseConfig] }),
        OutboxInfrastructureModule,
      ],
    }).compile();
    await app.init();
    database = app.get(DatabaseService).db;
    recovery = app.get(OutboxSemanticRecovery);
    sourceState = app.get(OutboxSemanticSourceState);
    manual = app.get(OutboxSemanticManualRequest);
    await database.insert(user).values({
      id: actorId,
      name: '복구 검증 사용자',
      email: `${actorId}@example.test`,
    });
  });
  beforeEach(async () => {
    await database
      .delete(version)
      .where(eq(version.organizationId, organizationId));
  });
  afterAll(async () => {
    if (database) {
      await database
        .delete(version)
        .where(eq(version.organizationId, organizationId));
      await database.delete(user).where(eq(user.id, actorId));
    }
    await app?.close();
  });

  it('R7-18 registry에 있는 의미 대상만 발견하며 반복 발견은 멱등하다', async () => {
    const target = scope();
    await database.insert(version).values([
      { ...target, desiredSeq: 1 },
      { ...scope(), aggregateKind: 'project', desiredSeq: 1 },
    ]);
    await recovery.discoverMissing(100);
    expect((await sourceState.current(target))?.state).toMatchObject({
      observedSeq: 0,
      indexedSeq: 0,
    });
    expect(await recovery.discoverMissing(100)).toBe(0);
    expect(
      await database
        .select()
        .from(state)
        .where(eq(state.organizationId, organizationId)),
    ).toHaveLength(1);
  });
  it('R7-19 자동 gap의 첫 접수는 즉시 가능하며 반복 접수는 cooldown을 지킨다', async () => {
    const target = scope();
    await database.insert(version).values({ ...target, desiredSeq: 1 });
    await sourceState.observeCommitted(target, 1);
    const first = (await recovery.claimGapBatch(25, fp)).filter(
      (row) => row.scope.organizationId === organizationId,
    );
    expect(first).toHaveLength(1);
    expect(first[0]?.state).toMatchObject({
      requeueCount: 1,
      manualRequestSeq: 0,
      observedSeq: 1,
    });
    expect(
      (await recovery.claimGapBatch(25, fp)).filter(
        (row) => row.scope.organizationId === organizationId,
      ),
    ).toHaveLength(0);
    await database
      .update(state)
      .set({ lastRequeuedAt: sql`clock_timestamp() - interval '11 minutes'` })
      .where(eq(state.organizationId, organizationId));
    expect(
      (await recovery.claimGapBatch(25, fp)).filter(
        (row) => row.scope.organizationId === organizationId,
      ),
    ).toHaveLength(1);
  });
  it('R7-19 두 실제 연결은 같은 gap을 중복 접수하지 않고 남은 행도 이어 접수한다', async () => {
    const targets = Array.from({ length: 10 }, () => scope());
    await database
      .insert(version)
      .values(targets.map((row) => ({ ...row, desiredSeq: 1 })));
    await database.insert(state).values(targets);
    const batches = await Promise.all([
      recovery.claimGapBatch(5, fp),
      recovery.claimGapBatch(5, fp),
    ]);
    const rest = await recovery.claimGapBatch(25, fp);
    const own = [...batches.flat(), ...rest].filter(
      (row) => row.scope.organizationId === organizationId,
    );
    expect(own).toHaveLength(10);
    expect(new Set(own.map((row) => row.scope.aggregateId)).size).toBe(10);
    expect(own.every((row) => row.state.requeueCount === 1)).toBe(true);
  });
  it.each(['desired', 'manual', 'fingerprint'] as const)(
    'R7-15 영구 실패는 자동 접수하지 않고 새 %s 요구에서만 회복한다',
    async (change) => {
      const target = scope();
      await database.insert(version).values({ ...target, desiredSeq: 1 });
      const claimed = await sourceState.acquireLease(target, fp);
      if (typeof claimed === 'string')
        throw new Error('실패 검증 lease가 없습니다.');
      await sourceState.release(target, claimed, {
        runStatus: 'failed',
        lastErrorCode: 'PROVIDER_UNAUTHORIZED',
      });
      await database
        .update(state)
        .set({ updatedAt: new Date(0), lastRequeuedAt: new Date(0) })
        .where(eq(state.organizationId, organizationId));
      expect(
        (await recovery.claimGapBatch(25, fp)).filter(
          (row) => row.scope.organizationId === organizationId,
        ),
      ).toHaveLength(0);
      if (change === 'desired')
        await database
          .update(version)
          .set({ desiredSeq: 2 })
          .where(eq(version.organizationId, organizationId));
      if (change === 'manual') await manual.request(target, actorId);
      const currentFp = change === 'fingerprint' ? 'b'.repeat(64) : fp;
      expect(
        (await recovery.claimGapBatch(25, currentFp)).filter(
          (row) => row.scope.organizationId === organizationId,
        ),
      ).toHaveLength(1);
    },
  );
  it('R7-19 cooldown은 크게 늘어도 overflow 없이 60분에서 멈춘다', async () => {
    const target = scope();
    await database.insert(version).values({ ...target, desiredSeq: 1 });
    await sourceState.observeCommitted(target, 1);
    await database
      .update(state)
      .set({
        requeueCount: 1000,
        lastRequeuedAt: sql`clock_timestamp() - interval '59 minutes'`,
      })
      .where(eq(state.organizationId, organizationId));
    expect(
      (await recovery.claimGapBatch(25, fp)).filter(
        (row) => row.scope.organizationId === organizationId,
      ),
    ).toHaveLength(0);
    await database
      .update(state)
      .set({ lastRequeuedAt: sql`clock_timestamp() - interval '61 minutes'` })
      .where(eq(state.organizationId, organizationId));
    expect(
      (await recovery.claimGapBatch(25, fp)).filter(
        (row) => row.scope.organizationId === organizationId,
      ),
    ).toHaveLength(1);
  });
  it('R7-19 삭제 gap과 모델 공간 변경 gap도 PG 상태로 접수한다', async () => {
    const deleted = scope();
    const stale = scope();
    await database.insert(version).values([
      { ...deleted, desiredSeq: 2, deleted: true },
      { ...stale, desiredSeq: 1 },
    ]);
    await database.insert(state).values([
      { ...deleted, indexedSeq: 1 },
      { ...stale, indexedSeq: 1, indexedFingerprint: 'b'.repeat(64) },
    ]);
    const batch = (await recovery.claimGapBatch(25, fp)).filter(
      (row) => row.scope.organizationId === organizationId,
    );
    expect(new Set(batch.map((row) => row.scope.aggregateId))).toEqual(
      new Set([deleted.aggregateId, stale.aggregateId]),
    );
    expect(batch.some((row) => row.version.deleted)).toBe(true);
    expect(
      (
        await database
          .select()
          .from(state)
          .where(
            and(
              eq(state.organizationId, organizationId),
              inArray(
                state.aggregateId,
                batch.map((row) => row.scope.aggregateId),
              ),
            ),
          )
      ).every((row) => row.requeueCount === 1),
    ).toBe(true);
  });
  it('R7-20 결정적 무작위500개 상태의 PG 접수 조건은 domain 복구 판정과 일치한다', async () => {
    const now = new Date();
    let seed = 20261009;
    const next = (limit: number) => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed % limit;
    };
    const rows = Array.from({ length: 500 }, () => {
      const target = scope();
      const desiredSeq = 1 + next(10);
      const manualRequestSeq = next(5);
      const statuses =
        OutboxSemanticSourceStateSelectSchema.shape.runStatus.options;
      const runStatus = statuses[next(statuses.length)];
      if (!runStatus) throw new Error('테스트 상태가 비어 있습니다.');
      const running = runStatus === 'running';
      const observedSeq = next(3) === 0 ? 0 : desiredSeq;
      const indexedSeq = next(desiredSeq + 1);
      const old = (minutes: number) =>
        new Date(now.getTime() - minutes * 60_000);
      return {
        version: {
          ...target,
          desiredSeq,
          deleted: next(5) === 0,
          updatedAt: old(30),
        },
        state: {
          ...target,
          observedSeq,
          observedAt: observedSeq ? old(30) : null,
          manualRequestSeq,
          manualRequestId: manualRequestSeq ? randomUUID() : null,
          manualRequestedAt: manualRequestSeq ? old(30) : null,
          indexedSeq,
          indexedManualSeq: next(manualRequestSeq + 1),
          indexedFingerprint: indexedSeq
            ? next(2)
              ? fp
              : 'b'.repeat(64)
            : null,
          runStatus,
          attemptSeq: next(2) ? desiredSeq : desiredSeq - 1,
          attemptManualSeq: next(2) ? manualRequestSeq : 0,
          attemptFingerprint: next(2) ? fp : 'b'.repeat(64),
          leaseToken: running ? randomUUID() : null,
          leaseExpiresAt: running
            ? new Date(now.getTime() + (next(2) ? 20 : -20) * 60_000)
            : null,
          gcRequired: next(2) === 0,
          lastIndexedAt: indexedSeq ? old(30) : null,
          updatedAt: old(30),
          requeueCount: next(10),
          lastRequeuedAt: next(3) ? old(next(2) ? 90 : 2) : null,
        },
      };
    });
    await database.insert(version).values(rows.map((row) => row.version));
    await database.insert(state).values(rows.map((row) => row.state));
    const current = await Promise.all(
      rows.map((row) => sourceState.current(row.version)),
    );
    const expected = new Set(
      current
        .filter(
          (row) =>
            row !== null && semanticRecoveryAction(row, fp, true) !== 'none',
        )
        .map((row) => row?.state?.aggregateId),
    );
    const selected = (await recovery.claimGapBatch(1000, fp)).filter(
      (row) => row.scope.organizationId === organizationId,
    );
    expect(new Set(selected.map((row) => row.scope.aggregateId))).toEqual(
      expected,
    );
  });
  it('수동 queue 전달 실패는 최신 claim만 반납해 복구 뒤 추가 quiet 없이 다시 접수한다', async () => {
    const target = scope();
    await database.insert(version).values({ ...target, desiredSeq: 1 });
    await manual.request(target, actorId);
    const first = (await recovery.claimGapBatch(25, fp)).find(
      (row) => row.scope.aggregateId === target.aggregateId,
    );
    if (!first) throw new Error('첫 전달 claim이 없습니다.');
    expect(await recovery.releaseDeliveryFailure(first)).toBe(true);
    const next = (await recovery.claimGapBatch(25, fp)).find(
      (row) => row.scope.aggregateId === target.aggregateId,
    );
    if (!next) throw new Error('전달 복구가 cooldown으로 막혔습니다.');
    expect(next.state.requeueCount).toBe(2);
    expect(await recovery.releaseDeliveryFailure(first)).toBe(false);
    expect((await sourceState.current(target))?.state?.lastRequeuedAt).toEqual(
      next.state.lastRequeuedAt,
    );
  });
});
