import { randomUUID } from 'node:crypto';

import { ConfigModule } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';

import databaseConfig from '@/database/config/database.config';
import { DatabaseService } from '@/database/database.service';
import type { SemanticLease } from '@/outbox/domain/semantic-source';
import { outboxAggregateVersion } from '@/outbox/infrastructure/persistence/drizzle/schema/outbox-aggregate-version.schema';
import { outboxSemanticSourceState } from '@/outbox/infrastructure/persistence/drizzle/schema/outbox-semantic-source-state.schema';
import { OutboxInfrastructureModule } from '@/outbox/outbox.module';
import { OutboxSemanticSourceState } from '@/outbox/outbox-semantic-source-state';

import { waitForCondition } from '@test/agent/support/workos-agent.e2e-support';
import { and, eq, sql } from 'drizzle-orm';

const describeIsolated =
  process.env.KG_TEST_ALLOW_WRITE === '1' &&
  process.env.DATABASE_URL &&
  new URL(process.env.DATABASE_URL).pathname === '/graph_p7_semantic'
    ? describe
    : describe.skip;

describeIsolated('의미 색인의 commit 관측·lease·활성화 PostgreSQL 계약', () => {
  const scope = {
    organizationId: `p7-state-${randomUUID()}`,
    aggregateKind: 'wiki_document',
    aggregateId: randomUUID(),
  } as const;
  const fingerprint = 'a'.repeat(64);
  let app: TestingModule;
  let database: DatabaseService['db'];
  let state: OutboxSemanticSourceState;
  const whereSource = and(
    eq(outboxSemanticSourceState.organizationId, scope.organizationId),
    eq(outboxSemanticSourceState.aggregateId, scope.aggregateId),
  );
  const whereVersion = and(
    eq(outboxAggregateVersion.organizationId, scope.organizationId),
    eq(outboxAggregateVersion.aggregateId, scope.aggregateId),
  );

  beforeAll(async () => {
    app = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, load: [databaseConfig] }),
        OutboxInfrastructureModule,
      ],
    }).compile();
    await app.init();
    database = app.get(DatabaseService).db;
    state = app.get(OutboxSemanticSourceState);
  });
  beforeEach(async () => {
    await database.delete(outboxAggregateVersion).where(whereVersion);
    await database
      .insert(outboxAggregateVersion)
      .values({ ...scope, desiredSeq: 1 });
  });
  afterAll(async () => {
    if (database)
      await database.delete(outboxAggregateVersion).where(whereVersion);
    await app?.close();
  });
  async function lease(): Promise<SemanticLease> {
    const result = await state.acquireLease(scope, fingerprint);
    if (typeof result === 'string')
      throw new Error('테스트 lease를 획득하지 못했습니다.');
    return result;
  }
  const activation = () => ({
    activeGenerationId: randomUUID(),
    indexedSignature: 'b'.repeat(64),
    indexedSourceUpdatedAt: new Date('2026-10-09T00:00:00Z'),
    indexedFingerprint: fingerprint,
  });

  it('R7-03 첫 commit 관측 시각은 같은 seq의 재전달로 연장되지 않는다', async () => {
    await state.observeCommitted(scope, 1);
    const before = await state.current(scope);
    await database
      .update(outboxSemanticSourceState)
      .set({ observedAt: sql`now() - interval '1 minute'` })
      .where(whereSource);
    const first = await state.current(scope);
    await state.observeCommitted(scope, 1);
    expect((await state.current(scope))?.state?.observedAt).toEqual(
      first?.state?.observedAt,
    );
    expect(before?.state?.observedSeq).toBe(1);
  });
  it('R7-03 실제1초뒤같은seq관측은최초DB시각을유지한다', async () => {
    await state.observeCommitted(scope, 1);
    const before = await state.current(scope);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    await state.observeCommitted(scope, 1);
    expect((await state.current(scope))?.state?.observedAt).toEqual(
      before?.state?.observedAt,
    );
  });
  it.each([0, 2])(
    'R7-04 현재 desired와 다른 seq=%i의 관측은 기록하지 않는다',
    async (seq) => {
      await state.observeCommitted(scope, seq);
      expect((await state.current(scope))?.state?.observedSeq).toBe(0);
    },
  );
  it('R7-06 유효 lease는 바쁘며 만료 takeover는 fence를 증가시킨다', async () => {
    const first = await lease();
    expect(await state.acquireLease(scope, fingerprint)).toBe('busy');
    await database
      .update(outboxSemanticSourceState)
      .set({ leaseExpiresAt: sql`now() - interval '1 second'` })
      .where(whereSource);
    const second = await lease();
    expect(second.fenceToken).toBe(first.fenceToken + 1);
    expect(second.leaseToken).not.toBe(first.leaseToken);
    expect(await state.heartbeat(scope, first)).toBe(false);
    expect(
      await state.release(scope, first, {
        runStatus: 'failed',
        lastErrorCode: 'SEMANTIC_INTERNAL',
      }),
    ).toBe(false);
    expect((await state.activate(scope, first, activation())).outcome).toBe(
      'superseded',
    );
    expect((await state.current(scope))?.state?.leaseToken).toBe(
      second.leaseToken,
    );
  });
  it('R7-09 두 연결의 lease 획득은 반복 경합에서도 하나만 성공한다', async () => {
    for (let i = 0; i < 20; i++) {
      const results = await Promise.all([
        state.acquireLease(scope, fingerprint),
        state.acquireLease(scope, fingerprint),
      ]);
      expect(
        results.filter((result) => typeof result !== 'string'),
      ).toHaveLength(1);
      const won = results.find((result) => typeof result !== 'string');
      if (!won || typeof won === 'string')
        throw new Error('경합 lease가 없습니다.');
      expect(
        await state.release(scope, won, {
          runStatus: 'idle',
          lastErrorCode: null,
        }),
      ).toBe(true);
    }
  });
  it('R7-10 현재 snapshot의 활성화는 만족 seq·서명·세대를 함께 기록한다', async () => {
    const claimed = await lease();
    await database
      .update(outboxSemanticSourceState)
      .set({
        retryCount: 3,
        requeueCount: 4,
        lastRequeuedAt: new Date(0),
        lastErrorCode: 'PROVIDER_TIMEOUT',
      })
      .where(whereSource);
    const before = (await state.current(scope))?.state;
    if (!before) throw new Error('활성화 전 상태가 없습니다.');
    const result = activation();
    expect(await state.activate(scope, claimed, result)).toMatchObject({
      outcome: 'activated',
      previousGenerationId: null,
    });
    expect((await state.current(scope))?.state).toEqual({
      ...before,
      ...result,
      indexedSeq: 1,
      indexedManualSeq: 0,
      lastIndexedAt: expect.any(Date),
      runStatus: 'idle',
      lastErrorCode: null,
      retryCount: 0,
      requeueCount: 0,
      lastRequeuedAt: null,
      leaseToken: null,
      leaseExpiresAt: null,
      gcRequired: true,
      updatedAt: expect.any(Date),
    });
  });
  it.each(['desired', 'deleted', 'fingerprint', 'manual'])(
    'R7-11~14 최신 %s 조건이 달라지면 이전 세대를 활성화하지 않는다',
    async (changed) => {
      const claimed = await lease();
      const result = activation();
      if (changed === 'desired')
        await database
          .update(outboxAggregateVersion)
          .set({ desiredSeq: 2 })
          .where(whereVersion);
      if (changed === 'deleted')
        await database
          .update(outboxAggregateVersion)
          .set({ deleted: true, desiredSeq: 2 })
          .where(whereVersion);
      if (changed === 'fingerprint') result.indexedFingerprint = 'c'.repeat(64);
      if (changed === 'manual')
        await database
          .update(outboxSemanticSourceState)
          .set({
            manualRequestSeq: 1,
            manualRequestId: randomUUID(),
            manualRequestedAt: sql`now()`,
          })
          .where(whereSource);
      expect((await state.activate(scope, claimed, result)).outcome).toBe(
        'superseded',
      );
      expect(
        (await state.current(scope))?.state?.activeGenerationId,
      ).toBeNull();
    },
  );
  it('R7-05 위조된 attempt seq는 활성화와 무재색인 만족을 모두 거부한다', async () => {
    const claimed = await lease();
    const wrong = { ...claimed, attemptSeq: 2 };
    expect((await state.activate(scope, wrong, activation())).outcome).toBe(
      'superseded',
    );
    expect(
      (await state.satisfyWithoutReindex(scope, wrong, activation())).outcome,
    ).toBe('superseded');
    expect((await state.current(scope))?.state?.indexedSeq).toBe(0);
  });
  it('R7-08 lease 없는 running과 관측 시각 없는 관측 seq는 DB에서 거부한다', async () => {
    await state.observeCommitted(scope, 1);
    await expect(
      database
        .update(outboxSemanticSourceState)
        .set({ runStatus: 'running' })
        .where(whereSource),
    ).rejects.toThrow();
    await expect(
      database
        .update(outboxSemanticSourceState)
        .set({ observedAt: null })
        .where(whereSource),
    ).rejects.toThrow();
    await expect(
      database
        .update(outboxSemanticSourceState)
        .set({ fenceToken: Number.MAX_SAFE_INTEGER + 1 })
        .where(whereSource),
    ).rejects.toThrow();
  });
  it('R7-07 상태 잠금을 기다리는 동안 lease가 만료되면 transaction 시작 시각으로 활성화하지 않는다', async () => {
    const claimed = await lease();
    let unlocked = () => {};
    let locked = () => {};
    const held = new Promise<void>((resolve) => {
      locked = resolve;
    });
    const release = new Promise<void>((resolve) => {
      unlocked = resolve;
    });
    const holding = database.transaction(async (transaction) => {
      await transaction
        .update(outboxSemanticSourceState)
        .set({ leaseExpiresAt: sql`clock_timestamp() + interval '2 seconds'` })
        .where(whereSource);
      locked();
      await release;
    });
    await held;
    const activating = state.activate(scope, claimed, activation());
    await new Promise((resolve) => setTimeout(resolve, 2200));
    unlocked();
    await holding;
    expect((await activating).outcome).toBe('superseded');
    expect((await state.current(scope))?.state?.activeGenerationId).toBeNull();
  });
  it('R7-11 owner쓰기잠금이먼저면활성화는commit뒤새desired를보고거부한다', async () => {
    const claimed = await lease();
    let release = () => {};
    let locked = () => {};
    const barrier = new Promise<void>((resolve) => {
      release = resolve;
    });
    const held = new Promise<void>((resolve) => {
      locked = resolve;
    });
    const owner = database.transaction(async (transaction) => {
      await transaction
        .update(outboxAggregateVersion)
        .set({ desiredSeq: 2 })
        .where(whereVersion);
      locked();
      await barrier;
    });
    await held;
    const activated = state.activate(scope, claimed, activation());
    release();
    await owner;
    expect((await activated).outcome).toBe('superseded');
    expect((await state.current(scope))?.state?.indexedSeq).toBe(0);
  });
  it('R7-11 활성화가registry잠금을먼저잡으면owner는그뒤commit하고새gap을남긴다', async () => {
    const claimed = await lease();
    let release = () => {};
    let locked = () => {};
    let registryLocked = () => {};
    const barrier = new Promise<void>((resolve) => {
      release = resolve;
    });
    const held = new Promise<void>((resolve) => {
      locked = resolve;
    });
    const registryHeld = new Promise<void>((resolve) => {
      registryLocked = resolve;
    });
    const holder = database.transaction(async (transaction) => {
      await transaction
        .select()
        .from(outboxSemanticSourceState)
        .where(whereSource)
        .for('update');
      locked();
      await waitForCondition(async () => {
        let acquired = false;
        try {
          await transaction.transaction(async (nested) => {
            await nested
              .select()
              .from(outboxAggregateVersion)
              .where(whereVersion)
              .for('update', { noWait: true });
            acquired = true;
            nested.rollback();
          });
        } catch (error) {
          if (!acquired) {
            expect(error).toMatchObject({ cause: { code: '55P03' } });
            return true;
          }
        }
        return false;
      }, '활성화가registry공유잠금을잡지않았습니다.');
      registryLocked();
      await barrier;
    });
    await held;
    const activated = state.activate(scope, claimed, activation());
    await registryHeld;
    const owner = database
      .update(outboxAggregateVersion)
      .set({ desiredSeq: 2 })
      .where(whereVersion);
    const writing = owner.then(() => undefined);
    release();
    await holder;
    expect((await activated).outcome).toBe('activated');
    await writing;
    expect(await state.current(scope)).toMatchObject({
      version: { desiredSeq: 2 },
      state: { indexedSeq: 1, runStatus: 'idle' },
    });
  });
});
