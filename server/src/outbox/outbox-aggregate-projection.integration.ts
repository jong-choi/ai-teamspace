import { randomUUID } from 'node:crypto';

import { ConfigModule } from '@nestjs/config';
import { Outbox } from '@nestjs/outbox';
import { Test, type TestingModule } from '@nestjs/testing';

import databaseConfig from '@/database/config/database.config';
import { DatabaseService } from '@/database/database.service';
import { outboxAggregateVersion } from '@/outbox/infrastructure/persistence/drizzle/schema/outbox-aggregate-version.schema';
import { OutboxInfrastructureModule } from '@/outbox/outbox.module';
import { OutboxAggregateChangePublisher } from '@/outbox/outbox-aggregate-change.publisher';
import { OutboxAggregateProjectionState } from '@/outbox/outbox-aggregate-projection-state';

import { eq } from 'drizzle-orm';

describe('그래프 영속 버전 초기 접수와 조건부 재예약', () => {
  const organizationId = `kg-version-test-${randomUUID()}`;
  const sourceId = 'project-one';
  let moduleRef: TestingModule;
  let database: DatabaseService['db'];
  let events: OutboxAggregateChangePublisher;
  let state: OutboxAggregateProjectionState;
  let outbox: Outbox;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, load: [databaseConfig] }),
        OutboxInfrastructureModule,
      ],
    }).compile();
    await moduleRef.init();
    database = moduleRef.get(DatabaseService).db;
    events = moduleRef.get(OutboxAggregateChangePublisher);
    state = moduleRef.get(OutboxAggregateProjectionState);
    outbox = moduleRef.get(Outbox);
  });

  beforeEach(async () => {
    await database
      .delete(outboxAggregateVersion)
      .where(eq(outboxAggregateVersion.organizationId, organizationId));
  });

  afterAll(async () => {
    if (database)
      await database
        .delete(outboxAggregateVersion)
        .where(eq(outboxAggregateVersion.organizationId, organizationId));
    await moduleRef?.close();
  });

  async function change(operation: 'changed' | 'removed' = 'changed') {
    await database.transaction((transaction) =>
      events.projectChanged(transaction, organizationId, sourceId, operation),
    );
  }

  async function current() {
    const source = await state.current(organizationId, 'project', sourceId);
    if (!source) throw new Error('테스트 원본 버전이 없습니다.');
    return source;
  }

  it('동시 초기 접수는 버전과 Outbox를 한 번만 만든다', async () => {
    const append = jest.spyOn(outbox, 'add');
    try {
      const accepted = await Promise.all(
        Array.from({ length: 4 }, () =>
          database.transaction((transaction) =>
            events.backfillIfMissing(
              transaction,
              organizationId,
              'project',
              sourceId,
            ),
          ),
        ),
      );
      expect(accepted.filter(Boolean)).toHaveLength(1);
      expect(append).toHaveBeenCalledTimes(1);
      expect(await current()).toMatchObject({
        desiredSeq: 1,
        appliedSeq: 0,
        deleted: false,
      });
    } finally {
      append.mockRestore();
    }
  });

  it('backfill은 기존 삭제 의도와 버전을 변경하지 않는다', async () => {
    await change('removed');
    const before = await current();
    const append = jest.spyOn(outbox, 'add');
    try {
      await expect(
        database.transaction((transaction) =>
          events.backfillIfMissing(
            transaction,
            organizationId,
            'project',
            sourceId,
          ),
        ),
      ).resolves.toBe(false);
      expect(await current()).toEqual(before);
      expect(append).not.toHaveBeenCalled();
    } finally {
      append.mockRestore();
    }
  });

  it('초기 Outbox 실패는 처음 만든 버전 행도 롤백한다', async () => {
    const append = jest
      .spyOn(outbox, 'add')
      .mockRejectedValueOnce(new Error('초기 접수 실패'));
    try {
      await expect(
        database.transaction((transaction) =>
          events.backfillIfMissing(
            transaction,
            organizationId,
            'project',
            sourceId,
          ),
        ),
      ).rejects.toThrow('초기 접수 실패');
      expect(
        await state.current(organizationId, 'project', sourceId),
      ).toBeNull();
    } finally {
      append.mockRestore();
    }
  });

  it('재예약은 현재 버전과 삭제 상태를 유지하면서 Outbox를 만든다', async () => {
    await change('removed');
    const before = await current();
    const append = jest.spyOn(outbox, 'add');
    try {
      await database.transaction((transaction) =>
        events.requeueCurrent(transaction, before),
      );
      expect(await current()).toMatchObject({
        desiredSeq: before.desiredSeq,
        deleted: true,
        appliedSeq: 0,
      });
      expect(append).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          payload: expect.objectContaining({
            sourceVersion: before.desiredSeq,
            operation: 'removed',
          }),
        }),
      );
    } finally {
      append.mockRestore();
    }
  });

  it('오래된 조회 결과는 새 버전 상태를 되돌리거나 재전달하지 않는다', async () => {
    await change();
    const stale = await current();
    await change('removed');
    const latest = await current();
    const append = jest.spyOn(outbox, 'add');
    try {
      await database.transaction((transaction) =>
        events.requeueCurrent(transaction, stale),
      );
      expect(await current()).toEqual(latest);
      expect(append).not.toHaveBeenCalled();
    } finally {
      append.mockRestore();
    }
  });

  it('이미 적용된 버전은 재예약하지 않는다', async () => {
    await change();
    const pending = await current();
    await state.markApplied(
      organizationId,
      'project',
      sourceId,
      pending.desiredSeq,
    );
    const append = jest.spyOn(outbox, 'add');
    try {
      await database.transaction((transaction) =>
        events.requeueCurrent(transaction, pending),
      );
      expect(await current()).toMatchObject({
        projectionStatus: 'applied',
        appliedSeq: pending.desiredSeq,
      });
      expect(append).not.toHaveBeenCalled();
    } finally {
      append.mockRestore();
    }
  });

  it('이전 worker의 성공과 실패는 새 버전의 상태에 영향을 주지 않는다', async () => {
    await change();
    const stale = await current();
    await change();
    const latest = await current();
    await state.markApplied(
      organizationId,
      'project',
      sourceId,
      stale.desiredSeq,
    );
    await state.markFailed(
      organizationId,
      'project',
      sourceId,
      stale.desiredSeq,
    );
    await state.markTerminalFailed(
      organizationId,
      'project',
      sourceId,
      stale.desiredSeq,
    );
    expect(await current()).toEqual(latest);
  });
});
