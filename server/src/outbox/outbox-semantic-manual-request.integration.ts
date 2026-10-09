import { randomUUID } from 'node:crypto';

import { ConfigModule } from '@nestjs/config';
import { Outbox } from '@nestjs/outbox';
import { Test, type TestingModule } from '@nestjs/testing';

import { user } from '@/auth/infrastructure/persistence/drizzle/generated/auth.schema';
import databaseConfig from '@/database/config/database.config';
import { DatabaseService } from '@/database/database.service';
import { describeKnowledgeGraph } from '@/knowledge-graph/testing/knowledge-graph-test-environment';
import { outboxAggregateVersion } from '@/outbox/infrastructure/persistence/drizzle/schema/outbox-aggregate-version.schema';
import { OutboxInfrastructureModule } from '@/outbox/outbox.module';
import { OutboxSemanticManualRequest } from '@/outbox/outbox-semantic-manual-request';
import { OutboxSemanticSourceState } from '@/outbox/outbox-semantic-source-state';

import { eq } from 'drizzle-orm';

describeKnowledgeGraph('수동 의미 갱신의 PostgreSQL 영속 접수와 합치기', () => {
  const scope = {
    organizationId: `p7-manual-${randomUUID()}`,
    aggregateKind: 'wiki_document',
    aggregateId: randomUUID(),
  } as const;
  const actorId = `p7-manual-actor-${randomUUID()}`;
  let app: TestingModule;
  let database: DatabaseService['db'];
  let requests: OutboxSemanticManualRequest;
  let state: OutboxSemanticSourceState;

  beforeAll(async () => {
    app = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, load: [databaseConfig] }),
        OutboxInfrastructureModule,
      ],
    }).compile();
    await app.init();
    database = app.get(DatabaseService).db;
    requests = app.get(OutboxSemanticManualRequest);
    state = app.get(OutboxSemanticSourceState);
    await database.insert(user).values({
      id: actorId,
      name: '수동 요청 검증 사용자',
      email: `${actorId}@example.test`,
    });
  });
  beforeEach(async () => {
    await database
      .delete(outboxAggregateVersion)
      .where(eq(outboxAggregateVersion.organizationId, scope.organizationId));
    await database
      .insert(outboxAggregateVersion)
      .values({ ...scope, desiredSeq: 1 });
  });
  afterAll(async () => {
    if (database) {
      await database
        .delete(outboxAggregateVersion)
        .where(eq(outboxAggregateVersion.organizationId, scope.organizationId));
      await database.delete(user).where(eq(user.id, actorId));
    }
    await app?.close();
  });
  afterEach(() => jest.restoreAllMocks());

  it('R7-16 실행 전의 연타는 같은 영속 requestId로 합치고 원본 seq·시각을 바꾸지 않는다', async () => {
    const before = await state.current(scope);
    const results = await Promise.all(
      Array.from({ length: 10 }, () => requests.request(scope, actorId)),
    );
    expect(results.every((result) => result.outcome === 'accepted')).toBe(true);
    const accepted = results.filter((result) => result.outcome === 'accepted');
    expect(new Set(accepted.map((result) => result.requestId)).size).toBe(1);
    expect(accepted.filter((result) => !result.coalesced)).toHaveLength(1);
    const current = await state.current(scope);
    expect(current?.version).toEqual(before?.version);
    expect(current?.state).toMatchObject({
      manualRequestSeq: 1,
      manualRequestedByUserId: actorId,
      manualTargetSeq: 1,
      manualDeliveredSeq: 0,
    });
  });
  it('R7-16 실행 중 새 클릭은 후속 요구 하나를 만들고 이후 연타는 거기에 합친다', async () => {
    await requests.request(scope, actorId);
    const claimed = await state.acquireLease(scope, 'a'.repeat(64));
    if (typeof claimed === 'string')
      throw new Error('수동 실행 lease가 없습니다.');
    const next = await requests.request(scope, actorId);
    expect(next).toMatchObject({
      outcome: 'accepted',
      manualRequestSeq: 2,
      coalesced: false,
    });
    expect(await requests.request(scope, actorId)).toMatchObject({
      ...next,
      coalesced: true,
    });
    expect((await state.current(scope))?.state?.attemptManualSeq).toBe(1);
    expect(
      (
        await state.activate(scope, claimed, {
          activeGenerationId: randomUUID(),
          indexedSignature: 'b'.repeat(64),
          indexedFingerprint: 'a'.repeat(64),
          indexedSourceUpdatedAt: new Date(0),
        })
      ).outcome,
    ).toBe('superseded');
    expect((await state.current(scope))?.state?.indexedManualSeq).toBe(0);
  });
  it('R7-16 영구 실패 뒤 수동 요청은 새 seq로 자격을 회복한다', async () => {
    await requests.request(scope, actorId);
    const claimed = await state.acquireLease(scope, 'a'.repeat(64));
    if (typeof claimed === 'string')
      throw new Error('수동 실행 lease가 없습니다.');
    await state.release(scope, claimed, {
      runStatus: 'failed',
      lastErrorCode: 'PROVIDER_UNAUTHORIZED',
    });
    expect(await state.acquireLease(scope, 'a'.repeat(64))).toBe('busy');
    expect(await requests.request(scope, actorId)).toMatchObject({
      outcome: 'accepted',
      manualRequestSeq: 2,
    });
    expect(typeof (await state.acquireLease(scope, 'a'.repeat(64)))).not.toBe(
      'string',
    );
  });
  it('R7-16 Outbox 실패는 수동 seq·requestId와 새 상태 행까지 롤백한다', async () => {
    const failed = jest
      .spyOn(app.get(Outbox), 'add')
      .mockRejectedValueOnce(new Error('수동 전달 의도 저장 실패'));
    await expect(requests.request(scope, actorId)).rejects.toThrow(
      '수동 전달 의도 저장 실패',
    );
    failed.mockRestore();
    expect((await state.current(scope))?.state).toBeNull();
    expect(await requests.request(scope, actorId)).toMatchObject({
      outcome: 'accepted',
      manualRequestSeq: 1,
    });
  });
  it('R7-16 삭제·다른 조직·없는 원본에는 수동 의도를 저장하지 않는다', async () => {
    expect(
      await requests.request(
        { ...scope, organizationId: '다른 조직' },
        actorId,
      ),
    ).toEqual({ outcome: 'not_found' });
    expect(
      await requests.request({ ...scope, aggregateId: randomUUID() }, actorId),
    ).toEqual({ outcome: 'not_found' });
    await database
      .update(outboxAggregateVersion)
      .set({ deleted: true, desiredSeq: 2 })
      .where(eq(outboxAggregateVersion.organizationId, scope.organizationId));
    expect(await requests.request(scope, actorId)).toEqual({
      outcome: 'not_found',
    });
    expect((await state.current(scope))?.state).toBeNull();
  });
  it('R7-17 전달 완료 seq는 단조 증가하며 미래 요청을 만족시키지 않는다', async () => {
    await requests.request(scope, actorId);
    await requests.markDelivered(scope, 1);
    await requests.markDelivered(scope, 0);
    await requests.markDelivered(scope, 3);
    expect((await state.current(scope))?.state?.manualDeliveredSeq).toBe(1);
  });
  it('R7-16 다른 연결의 삭제 transaction이 먼저 잠그면 수동 접수는 commit된 tombstone을 보고 거부한다', async () => {
    let unlock = () => {};
    let locked = () => {};
    const barrier = new Promise<void>((resolve) => {
      unlock = resolve;
    });
    const held = new Promise<void>((resolve) => {
      locked = resolve;
    });
    const removing = database.transaction(async (transaction) => {
      await transaction
        .update(outboxAggregateVersion)
        .set({ deleted: true, desiredSeq: 2 })
        .where(eq(outboxAggregateVersion.organizationId, scope.organizationId));
      locked();
      await barrier;
    });
    await held;
    const requesting = requests.request(scope, actorId);
    try {
      unlock();
      await removing;
      expect(await requesting).toEqual({ outcome: 'not_found' });
      expect((await state.current(scope))?.state).toBeNull();
    } finally {
      unlock();
      await Promise.allSettled([removing, requesting]);
    }
  });
});
