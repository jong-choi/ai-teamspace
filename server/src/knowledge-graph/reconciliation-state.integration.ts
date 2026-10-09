import { randomUUID } from 'node:crypto';

import { ConfigModule } from '@nestjs/config';
import { Outbox } from '@nestjs/outbox';
import { PostgresOutboxStore } from '@nestjs/outbox/postgres';
import { Test, type TestingModule } from '@nestjs/testing';

import databaseConfig from '@/database/config/database.config';
import { DatabaseService } from '@/database/database.service';
import { digestGraphJson } from '@/knowledge-graph/domain/graph-json-digest';
import { ReconciliationPersistenceModule } from '@/knowledge-graph/infrastructure/persistence/drizzle/reconciliation-persistence.module';
import { reconciliationScope } from '@/knowledge-graph/infrastructure/persistence/drizzle/schema/reconciliation-scope.schema';
import { OutboxProjectionDeliveryAdapter } from '@/knowledge-graph/infrastructure/persistence/outbox/outbox-projection-delivery.adapter';
import { ProjectionDeliveryRepository } from '@/knowledge-graph/infrastructure/persistence/projection-delivery.repository';
import { ReconciliationScopeRepository } from '@/knowledge-graph/infrastructure/persistence/reconciliation-scope.repository';
import { describeKnowledgeGraph } from '@/knowledge-graph/testing/knowledge-graph-test-environment';
import { outboxAggregateVersion } from '@/outbox/infrastructure/persistence/drizzle/schema/outbox-aggregate-version.schema';
import { OutboxInfrastructureModule } from '@/outbox/outbox.module';
import { OutboxAggregateChangePublisher } from '@/outbox/outbox-aggregate-change.publisher';
import { OutboxAggregateVersionSchema } from '@/outbox/outbox-aggregate-event.schema';
import { OutboxAggregateProjectionState } from '@/outbox/outbox-aggregate-projection-state';

import { and, eq, inArray, isNotNull, or, sql } from 'drizzle-orm';

describeKnowledgeGraph(
  '전용 PostgreSQL의 복구 lease·재예약·snapshot 관찰',
  () => {
    const organizationId = `kg-p6-state-${randomUUID()}`;
    const organizationIds = [
      organizationId,
      `${organizationId}-b`,
      `${organizationId}-c`,
    ];
    let app: TestingModule;
    let database: DatabaseService['db'];
    let delivery: ProjectionDeliveryRepository;
    let scopes: ReconciliationScopeRepository;
    let state: OutboxAggregateProjectionState;
    let events: OutboxAggregateChangePublisher;
    let store: PostgresOutboxStore;

    beforeAll(async () => {
      app = await Test.createTestingModule({
        imports: [
          ConfigModule.forRoot({ isGlobal: true, load: [databaseConfig] }),
          ReconciliationPersistenceModule,
          OutboxInfrastructureModule,
        ],
        providers: [
          {
            provide: ProjectionDeliveryRepository,
            useClass: OutboxProjectionDeliveryAdapter,
          },
        ],
      }).compile();
      await app.init();
      database = app.get(DatabaseService).db;
      delivery = app.get(ProjectionDeliveryRepository);
      scopes = app.get(ReconciliationScopeRepository);
      state = app.get(OutboxAggregateProjectionState);
      events = app.get(OutboxAggregateChangePublisher);
      store = app.get(PostgresOutboxStore);
    });
    async function cleanup() {
      await database
        .delete(outboxAggregateVersion)
        .where(inArray(outboxAggregateVersion.organizationId, organizationIds));
      await database
        .delete(reconciliationScope)
        .where(
          or(
            inArray(reconciliationScope.id, [
              'organizations',
              'membership_sources',
              'organization_presence',
            ]),
            eq(reconciliationScope.organizationId, organizationId),
          ),
        );
      // 이 suite의 전용 DB에 저장한 Outbox는 SDK의 lease/ack로 정리한다.
      for (;;) {
        const rows = await store.claim({
          owner: 'p6-state-cleanup',
          now: Date.now(),
          leaseMs: 10_000,
          limit: 1000,
        });
        if (rows.length === 0) break;
        for (const row of rows)
          await store.markPublished(row.id, 'p6-state-cleanup');
      }
    }
    beforeEach(async () => {
      await cleanup();
    });
    afterEach(() => {
      jest.restoreAllMocks();
    });
    afterAll(async () => {
      try {
        if (database) await cleanup();
      } finally {
        await app?.close();
      }
    });
    async function insertSource(
      id: string = randomUUID(),
      values: Partial<typeof outboxAggregateVersion.$inferInsert> = {},
    ) {
      const [row] = await database
        .insert(outboxAggregateVersion)
        .values({
          organizationId,
          aggregateKind: 'project',
          aggregateId: id,
          desiredSeq: 1,
          updatedAt: new Date(0),
          ...values,
        })
        .returning();
      if (!row) throw new Error('원본 fixture가 없습니다.');
      return OutboxAggregateVersionSchema.parse(row);
    }

    it('두 재예약 worker는 다른 rows를 claim하고 cooldown 동안 추가 이벤트를 만들지 않는다', async () => {
      await database.insert(outboxAggregateVersion).values(
        Array.from(
          { length: 25 },
          (_, index): typeof outboxAggregateVersion.$inferInsert => ({
            organizationId,
            aggregateKind: 'project',
            aggregateId: `source-${index.toString().padStart(3, '0')}`,
            desiredSeq: 1,
            updatedAt: new Date(0),
          }),
        ),
      );
      expect(
        await Promise.all([
          delivery.requeuePendingBatch(10),
          delivery.requeuePendingBatch(10),
        ]),
      ).toEqual([10, 10]);
      const queued = await database
        .select()
        .from(outboxAggregateVersion)
        .where(
          and(
            eq(outboxAggregateVersion.organizationId, organizationId),
            isNotNull(outboxAggregateVersion.lastRequeuedAt),
          ),
        );
      expect(queued).toHaveLength(20);
      expect(
        queued.every(
          ({ desiredSeq, appliedSeq, requeueCount }) =>
            desiredSeq === 1 && appliedSeq === 0 && requeueCount === 1,
        ),
      ).toBe(true);
      expect((await store.stats(Date.now())).pending).toBe(20);
      expect(await delivery.requeuePendingBatch(10)).toBe(5);
      expect(await delivery.requeuePendingBatch(10)).toBe(0);
      expect((await store.stats(Date.now())).pending).toBe(25);
    });

    it('R-02 영구 실패는 그대로 두고 뒤의 pending 원본만 재예약한다', async () => {
      const failed = await insertSource('first', {
        projectionStatus: 'failed',
      });
      await state.markApplying(
        organizationId,
        'project',
        failed.aggregateId,
        failed.desiredSeq,
      );
      await state.markFailed(
        organizationId,
        'project',
        failed.aggregateId,
        failed.desiredSeq,
      );
      await state.markApplied(
        organizationId,
        'project',
        failed.aggregateId,
        failed.desiredSeq,
        'a'.repeat(64),
      );
      await insertSource('second', { updatedAt: new Date(1) });
      expect(await delivery.requeuePendingBatch(10)).toBe(1);
      expect(await delivery.requeuePendingBatch(10)).toBe(0);
      expect(await state.current(organizationId, 'project', 'first')).toEqual(
        failed,
      );
      expect((await store.stats(Date.now())).pending).toBe(1);
      const [second] = await database
        .select()
        .from(outboxAggregateVersion)
        .where(
          and(
            eq(outboxAggregateVersion.organizationId, organizationId),
            eq(outboxAggregateVersion.aggregateId, 'second'),
          ),
        );
      expect(second?.lastRequeuedAt).toBeInstanceOf(Date);
    });

    it('R-03 영구 실패도 새 owner 변경이 오면 새 seq와 초기 cooldown으로 접수된다', async () => {
      await insertSource('failed-change', {
        projectionStatus: 'failed',
        requeueCount: 6,
        lastRequeuedAt: new Date(0),
      });
      await database.transaction((transaction) =>
        events.projectChanged(
          transaction,
          organizationId,
          'failed-change',
          'changed',
        ),
      );
      expect(
        await state.current(organizationId, 'project', 'failed-change'),
      ).toMatchObject({
        projectionStatus: 'pending',
        desiredSeq: 2,
        requeueCount: 0,
        lastRequeuedAt: null,
      });
    });

    it.each([
      ['retry_scheduled', 20, 30],
      ['applying', 5, 11],
    ] as const)(
      'R-04/R-05 %s는 정체 기준 전에는 유지하고 이후에만 재예약한다',
      async (projectionStatus, beforeMinutes, afterMinutes) => {
        const source = await insertSource(undefined, { projectionStatus });
        const age = async (minutes: number) =>
          database
            .update(outboxAggregateVersion)
            .set({
              lastAttemptedAt: sql`now() - ${minutes} * interval '1 minute'`,
            })
            .where(eq(outboxAggregateVersion.aggregateId, source.aggregateId));
        await age(beforeMinutes);
        expect(await delivery.requeuePendingBatch(1)).toBe(0);
        await age(afterMinutes);
        expect(await delivery.requeuePendingBatch(1)).toBe(1);
      },
    );

    it.each([
      [0, 4, 6],
      [3, 39, 41],
      [10, 59, 61],
    ])(
      'R-06 재예약 횟수 %i의 cooldown은 지수 증가하며 60분에서 멈춘다',
      async (requeueCount, beforeMinutes, afterMinutes) => {
        const source = await insertSource(undefined, { requeueCount });
        const age = async (minutes: number) =>
          database
            .update(outboxAggregateVersion)
            .set({
              lastRequeuedAt: sql`now() - ${minutes} * interval '1 minute'`,
            })
            .where(eq(outboxAggregateVersion.aggregateId, source.aggregateId));
        await age(beforeMinutes);
        expect(await delivery.requeuePendingBatch(1)).toBe(0);
        await age(afterMinutes);
        expect(await delivery.requeuePendingBatch(1)).toBe(1);
        expect(
          (await state.current(organizationId, 'project', source.aggregateId))
            ?.requeueCount,
        ).toBe(requeueCount + 1);
      },
    );

    it('Outbox 실패는 재예약 시각·상태까지 롤백하고 다음 시도는 정상 접수한다', async () => {
      const source = await insertSource(undefined, {
        projectionStatus: 'pending',
      });
      jest
        .spyOn(app.get(Outbox), 'add')
        .mockRejectedValueOnce(new Error('의도한 Outbox 실패'));
      await expect(delivery.requeuePendingBatch(1)).rejects.toThrow(
        '의도한 Outbox 실패',
      );
      expect(
        await state.current(organizationId, 'project', source.aggregateId),
      ).toMatchObject({
        projectionStatus: 'pending',
        lastRequeuedAt: null,
        requeueCount: 0,
      });
      expect((await store.stats(Date.now())).pending).toBe(0);
      expect(await delivery.requeuePendingBatch(1)).toBe(1);
      expect((await store.stats(Date.now())).pending).toBe(1);
    });

    it('lease takeover 이후 이전 token은 cursor·scope 등록·새 intent를 기록하지 못한다', async () => {
      await scopes.initialize();
      const first = await scopes.claim('membership_sources');
      if (!first) throw new Error('최초 lease가 없습니다.');
      expect(await scopes.claim('membership_sources')).toBeNull();
      await database
        .update(reconciliationScope)
        .set({ leaseUntil: new Date(0) })
        .where(eq(reconciliationScope.id, first.id));
      const second = await scopes.claim('membership_sources');
      if (!second) throw new Error('takeover lease가 없습니다.');
      expect(second.leaseToken).not.toBe(first.leaseToken);
      expect(
        await scopes.complete(
          first,
          {
            afterOrganizationId: 'stale',
            afterAggregateId: 'old',
          },
          { failed: false, delayMs: 0 },
        ),
      ).toBe(false);
      const source = await insertSource(undefined, {
        aggregateKind: 'membership',
      });
      expect(
        await delivery.recordObservedSnapshot(
          source,
          {
            deleted: false,
            snapshotDigest: digestGraphJson({ name: '새 원본' }),
          },
          first,
        ),
      ).toBe('lease_lost');
      expect(
        (await state.current(organizationId, 'membership', source.aggregateId))
          ?.desiredSeq,
      ).toBe(1);
      expect(
        await scopes.complete(
          second,
          {
            afterOrganizationId: organizationId,
            afterAggregateId: source.aggregateId,
          },
          { failed: false, delayMs: 0 },
        ),
      ).toBe(true);
      const next = await scopes.claim('membership_sources');
      expect(next).toMatchObject({
        afterOrganizationId: organizationId,
        afterAggregateId: source.aggregateId,
      });
    });

    it('snapshot 유실 변경은 한 번만 새 seq로 접수하고 pending snapshot을 계속 증가시키지 않는다', async () => {
      await scopes.initialize();
      const scope = await scopes.claim('membership_sources');
      if (!scope) throw new Error('관찰 lease가 없습니다.');
      const before = digestGraphJson({ role: 'member' });
      const after = digestGraphJson({ role: 'admin' });
      const source = await insertSource(undefined, {
        aggregateKind: 'membership',
        desiredSeq: 2,
        appliedSeq: 2,
        appliedSnapshotDigest: before,
        projectionStatus: 'applied',
      });
      expect(
        await delivery.recordObservedSnapshot(
          source,
          {
            deleted: false,
            snapshotDigest: after,
          },
          scope,
        ),
      ).toBe('recorded');
      const current = await state.current(
        organizationId,
        'membership',
        source.aggregateId,
      );
      if (!current) throw new Error('관찰된 원본이 없습니다.');
      expect(current).toMatchObject({
        desiredSeq: 3,
        appliedSeq: 2,
        appliedSnapshotDigest: before,
      });
      expect(
        await delivery.recordObservedSnapshot(
          OutboxAggregateVersionSchema.parse(current),
          { deleted: false, snapshotDigest: after },
          scope,
        ),
      ).toBe('unchanged');
      expect((await store.stats(Date.now())).pending).toBe(1);
      await state.markApplied(
        organizationId,
        'membership',
        source.aggregateId,
        3,
        after,
      );
      expect(
        await state.current(organizationId, 'membership', source.aggregateId),
      ).toMatchObject({
        desiredSeq: 3,
        appliedSeq: 3,
        appliedSnapshotDigest: after,
      });
    });

    it('새 live 변경 뒤 오래된 관찰은 현재 seq와 삭제 상태를 되돌리지 않는다', async () => {
      await scopes.initialize();
      const scope = await scopes.claim('membership_sources');
      if (!scope) throw new Error('관찰 lease가 없습니다.');
      const source = await insertSource(undefined, {
        aggregateKind: 'membership',
        appliedSeq: 1,
      });
      await database.transaction((transaction) =>
        events.membershipChanged(
          transaction,
          organizationId,
          source.aggregateId,
          'removed',
        ),
      );
      expect(
        await delivery.recordObservedSnapshot(
          source,
          {
            deleted: false,
            snapshotDigest: digestGraphJson({ stale: true }),
          },
          scope,
        ),
      ).toBe('unchanged');
      expect(
        await state.current(organizationId, 'membership', source.aggregateId),
      ).toMatchObject({
        desiredSeq: 2,
        deleted: true,
      });
      expect((await store.stats(Date.now())).pending).toBe(1);
    });

    it('R-07 관찰 batch는 applied membership만 읽고 pending에는 새 seq를 만들지 않는다', async () => {
      await scopes.initialize();
      const scope = await scopes.claim('membership_sources');
      if (!scope) throw new Error('관찰 lease가 없습니다.');
      const pending = await insertSource('pending-membership', {
        aggregateKind: 'membership',
      });
      const applied = await insertSource('applied-membership', {
        aggregateKind: 'membership',
        appliedSeq: 1,
        projectionStatus: 'applied',
      });
      await insertSource('applied-project', {
        appliedSeq: 1,
        projectionStatus: 'applied',
      });
      expect(await state.listMembershipObservationBatch(null, 100)).toEqual([
        applied,
      ]);
      expect(
        await delivery.recordObservedSnapshot(
          pending,
          {
            deleted: false,
            snapshotDigest: digestGraphJson({ role: 'admin' }),
          },
          scope,
        ),
      ).toBe('unchanged');
      expect(
        (await state.current(organizationId, 'membership', pending.aggregateId))
          ?.desiredSeq,
      ).toBe(1);
      expect((await store.stats(Date.now())).pending).toBe(0);
    });

    it('R-09 삭제된 membership의 재가입은 같은 user id의 changed 의도로 접수한다', async () => {
      await scopes.initialize();
      const scope = await scopes.claim('membership_sources');
      if (!scope) throw new Error('관찰 lease가 없습니다.');
      const removed = await insertSource(undefined, {
        aggregateKind: 'membership',
        appliedSeq: 1,
        projectionStatus: 'applied',
        deleted: true,
        appliedSnapshotDigest: digestGraphJson(null),
      });
      expect(await state.listMembershipObservationBatch(null, 100)).toEqual([
        removed,
      ]);
      expect(
        await delivery.recordObservedSnapshot(
          removed,
          {
            deleted: false,
            snapshotDigest: digestGraphJson({ role: 'member' }),
          },
          scope,
        ),
      ).toBe('recorded');
      expect(
        await state.current(organizationId, 'membership', removed.aggregateId),
      ).toMatchObject({ desiredSeq: 2, deleted: false });
    });

    it('조직 발견 scope와 owner 접수 lease는 중복 등록과 잘못된 조직 접수를 막는다', async () => {
      await scopes.initialize();
      const global = await scopes.claim('organizations');
      if (!global) throw new Error('조직 발견 lease가 없습니다.');
      expect(await scopes.registerOrganizations(global, [organizationId])).toBe(
        true,
      );
      const rows = await database
        .select()
        .from(reconciliationScope)
        .where(eq(reconciliationScope.organizationId, organizationId));
      expect(rows).toHaveLength(10);
      const scope = await scopes.claim('owner_sources');
      if (!scope?.aggregateKind)
        throw new Error('owner 접수 lease가 없습니다.');
      expect(
        await delivery.initializeBatch(
          scope.aggregateKind,
          '잘못된 조직',
          [{ id: 'source-wrong' }],
          scope,
        ),
      ).toBe(false);
      expect(
        await delivery.initializeBatch(
          scope.aggregateKind,
          organizationId,
          [{ id: 'source-valid' }],
          scope,
        ),
      ).toBe(true);
      expect((await store.stats(Date.now())).pending).toBe(1);
      await database
        .update(reconciliationScope)
        .set({ leaseUntil: new Date(0) })
        .where(eq(reconciliationScope.id, scope.id));
      expect(
        await delivery.initializeBatch(
          scope.aggregateKind,
          organizationId,
          [{ id: 'source-expired' }],
          scope,
        ),
      ).toBe(false);
      expect((await store.stats(Date.now())).pending).toBe(1);
    });

    it('registry의 음수·안전 범위 밖 seq는 DB에서 거부한다', async () => {
      await expect(
        insertSource('negative', { desiredSeq: -1 }),
      ).rejects.toThrow();
      await expect(
        insertSource('unsafe', { desiredSeq: Number.MAX_SAFE_INTEGER + 1 }),
      ).rejects.toThrow();
      await expect(
        insertSource('invalid-applied', { desiredSeq: 1, appliedSeq: 2 }),
      ).rejects.toThrow();
      expect(
        await database
          .select()
          .from(outboxAggregateVersion)
          .where(eq(outboxAggregateVersion.organizationId, organizationId)),
      ).toHaveLength(0);
    });

    it('R-11 레지스트리 조직은 중복 없이 조직 id keyset으로 이어진다', async () => {
      for (const id of organizationIds) {
        await insertSource(undefined, { organizationId: id });
        await insertSource(undefined, {
          organizationId: id,
          aggregateKind: 'membership',
        });
      }
      const visited: string[] = [];
      let after: string | null = null;
      for (let pageNumber = 0; pageNumber < 100; pageNumber += 1) {
        const page = await state.listTrackedOrganizationIds(after, 2);
        if (page.length === 0) break;
        const ids = page.map((row) => row.organizationId);
        expect(ids).toEqual(
          [...ids].sort((left, right) => left.localeCompare(right)),
        );
        const cursor = after;
        if (cursor !== null) expect(ids.every((id) => id > cursor)).toBe(true);
        visited.push(...ids);
        after = ids.at(-1) ?? null;
      }
      expect(new Set(visited).size).toBe(visited.length);
      expect(visited.filter((id) => organizationIds.includes(id))).toEqual(
        organizationIds,
      );
    });

    it('R-12 조직 tombstone은 이미 삭제된 source와 더 새 live 변경을 되돌리지 않는다', async () => {
      await scopes.initialize();
      const owned = await scopes.claim('organization_presence');
      if (!owned) throw new Error('조직 존재 lease가 없습니다.');
      await insertSource('already-removed', { deleted: true });
      const live = await Promise.all(
        ['a', 'b', 'c', 'd'].map((id) => insertSource(id)),
      );
      await database.transaction((transaction) =>
        events.projectChanged(transaction, organizationId, 'a', 'changed'),
      );
      expect(
        await state.listLiveSourcesForOrganization(organizationId, null, 100),
      ).toHaveLength(4);
      expect(await delivery.recordOrganizationTombstones(owned, live)).toBe(3);
      expect(await state.current(organizationId, 'project', 'a')).toMatchObject(
        {
          desiredSeq: 2,
          deleted: false,
        },
      );
      expect(await state.current(organizationId, 'project', 'b')).toMatchObject(
        {
          desiredSeq: 2,
          deleted: true,
        },
      );
      expect((await store.stats(Date.now())).pending).toBe(4);
      expect(await delivery.recordOrganizationTombstones(owned, live)).toBe(0);
    });

    it('R-13 만료된 presence lease는 owner scope를 삭제할 수 없다', async () => {
      await scopes.initialize();
      const organizations = await scopes.claim('organizations');
      if (!organizations) throw new Error('조직 발견 lease가 없습니다.');
      await scopes.registerOrganizations(organizations, [organizationId]);
      const presence = await scopes.claim('organization_presence');
      if (!presence) throw new Error('조직 존재 lease가 없습니다.');
      await database
        .update(reconciliationScope)
        .set({ leaseUntil: new Date(0) })
        .where(eq(reconciliationScope.id, presence.id));
      expect(
        await scopes.removeOrganizationScopes(presence, organizationId),
      ).toBe(false);
      expect(
        await database
          .select()
          .from(reconciliationScope)
          .where(eq(reconciliationScope.organizationId, organizationId)),
      ).toHaveLength(10);
      const takeover = await scopes.claim('organization_presence');
      if (!takeover) throw new Error('takeover lease가 없습니다.');
      expect(
        await scopes.removeOrganizationScopes(takeover, organizationId),
      ).toBe(true);
      expect(
        await database
          .select()
          .from(reconciliationScope)
          .where(eq(reconciliationScope.organizationId, organizationId)),
      ).toHaveLength(0);
    });

    it('R-10 조직 등록도 이전 lease token으로는 실행할 수 없다', async () => {
      await scopes.initialize();
      const first = await scopes.claim('organizations');
      if (!first) throw new Error('조직 발견 lease가 없습니다.');
      await database
        .update(reconciliationScope)
        .set({ leaseUntil: new Date(0) })
        .where(eq(reconciliationScope.id, first.id));
      const takeover = await scopes.claim('organizations');
      if (!takeover) throw new Error('takeover lease가 없습니다.');
      expect(await scopes.registerOrganizations(first, [organizationId])).toBe(
        false,
      );
      expect(
        await scopes.registerOrganizations(takeover, [organizationId]),
      ).toBe(true);
    });

    it.each([
      { purpose: 'organizations', afterAggregateId: 'invalid' },
      { purpose: 'organization_presence', afterAggregateId: 'invalid' },
      {
        purpose: 'owner_sources',
        organizationId,
        aggregateKind: 'project',
        afterOrganizationId: 'invalid',
      },
      { purpose: 'membership_sources', afterOrganizationId: organizationId },
      { purpose: 'membership_sources', afterAggregateId: 'invalid' },
    ] satisfies Omit<typeof reconciliationScope.$inferInsert, 'id'>[])(
      'R-15 $purpose의 잘못된 cursor 조합은 DB에서 거부한다',
      async (values) => {
        await expect(
          database
            .insert(reconciliationScope)
            .values({ id: randomUUID(), ...values }),
        ).rejects.toThrow();
      },
    );

    it('R-16 lease 획득과 만료 판정은 프로세스 시계 차이와 무관한 DB 시계다', async () => {
      await scopes.initialize();
      const first = await scopes.claim('membership_sources');
      if (!first) throw new Error('관찰 lease가 없습니다.');
      await database
        .update(reconciliationScope)
        .set({ leaseUntil: sql`now() + interval '1 second'` })
        .where(eq(reconciliationScope.id, first.id));
      jest.spyOn(Date, 'now').mockReturnValue(0);
      expect(await scopes.claim('membership_sources')).toBeNull();
      await new Promise((resolve) => setTimeout(resolve, 2_000));
      const takeover = await scopes.claim('membership_sources');
      expect(takeover?.leaseToken).not.toBe(first.leaseToken);
      expect(takeover?.leaseToken).toBeTruthy();
    });

    it('복구 통계는 applied를 제외하고 영구 실패·정체 count와 실제 timestamp를 반환한다', async () => {
      const [before] = await state.recoveryStats();
      if (!before) throw new Error('복구 통계 기준값이 없습니다.');
      await insertSource('pending', { requeueCount: 6 });
      await insertSource('applying', { projectionStatus: 'applying' });
      await insertSource('retry', { projectionStatus: 'retry_scheduled' });
      await insertSource('failed', { projectionStatus: 'failed' });
      await insertSource('applied', {
        projectionStatus: 'applied',
        appliedSeq: 1,
      });
      expect(await state.recoveryStats()).toEqual([
        {
          pending: before.pending + 1,
          applying: before.applying + 1,
          retryScheduled: before.retryScheduled + 1,
          failed: before.failed + 1,
          requeueStuck: before.requeueStuck + 1,
          oldestPendingAt: new Date(0),
        },
      ]);
    });
  },
);
