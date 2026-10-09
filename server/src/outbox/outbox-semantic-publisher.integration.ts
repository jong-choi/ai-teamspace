import { randomUUID } from 'node:crypto';

import { ConfigModule } from '@nestjs/config';
import { Outbox } from '@nestjs/outbox';
import { Test, type TestingModule } from '@nestjs/testing';

import databaseConfig from '@/database/config/database.config';
import { DatabaseService } from '@/database/database.service';
import { outboxAggregateVersion } from '@/outbox/infrastructure/persistence/drizzle/schema/outbox-aggregate-version.schema';
import { OutboxInfrastructureModule } from '@/outbox/outbox.module';
import { OutboxAggregateChangePublisher } from '@/outbox/outbox-aggregate-change.publisher';
import { KNOWLEDGE_GRAPH_SEMANTIC_CHANGED_TOPIC } from '@/outbox/outbox-semantic-event.schema';

import { eq } from 'drizzle-orm';
import { z } from 'zod';

const describeIsolated =
  process.env.KG_TEST_ALLOW_WRITE === '1' &&
  process.env.DATABASE_URL &&
  new URL(process.env.DATABASE_URL).pathname === '/graph_p7_semantic'
    ? describe
    : describe.skip;

describeIsolated('그래프 변경 publisher의 의미 메시지 소유 범위', () => {
  const organizationId = `p7-publisher-${randomUUID()}`;
  let moduleRef: TestingModule;
  let database: DatabaseService['db'];
  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [databaseConfig],
          ignoreEnvFile: true,
        }),
        OutboxInfrastructureModule,
      ],
    }).compile();
    await moduleRef.init();
    database = moduleRef.get(DatabaseService).db;
  });
  afterAll(async () => {
    if (database)
      await database
        .delete(outboxAggregateVersion)
        .where(eq(outboxAggregateVersion.organizationId, organizationId));
    await moduleRef?.close();
  });
  it('U7-19 Wiki만 의미 메시지를 추가하고 다른kind·backfill·requeue는 구조 메시지만 기록한다', async () => {
    const publisher = moduleRef.get(OutboxAggregateChangePublisher);
    const recording = jest.spyOn(moduleRef.get(Outbox), 'add');
    try {
      await database.transaction((transaction) =>
        publisher.wikiChanged(
          transaction,
          organizationId,
          randomUUID(),
          'changed',
        ),
      );
      expect(
        recording.mock.calls.filter(
          (call) =>
            z.object({ topic: z.string() }).parse(call[1]).topic ===
            KNOWLEDGE_GRAPH_SEMANTIC_CHANGED_TOPIC,
        ),
      ).toHaveLength(1);
      recording.mockClear();
      for (const notify of [
        publisher.projectChanged.bind(publisher),
        publisher.ticketChanged.bind(publisher),
        publisher.ticketLabelChanged.bind(publisher),
        publisher.meetingChanged.bind(publisher),
        publisher.membershipChanged.bind(publisher),
        publisher.meetingRoomChanged.bind(publisher),
        publisher.meetingRecurrenceChanged.bind(publisher),
        publisher.curatedNodeChanged.bind(publisher),
        publisher.curatedEdgeChanged.bind(publisher),
      ]) {
        await database.transaction((transaction) =>
          notify(transaction, organizationId, randomUUID(), 'changed'),
        );
      }
      expect(recording.mock.calls).toHaveLength(9);
      expect(
        recording.mock.calls.filter(
          (call) =>
            z.object({ topic: z.string() }).parse(call[1]).topic ===
            KNOWLEDGE_GRAPH_SEMANTIC_CHANGED_TOPIC,
        ),
      ).toHaveLength(0);
      recording.mockClear();
      await database.transaction((transaction) =>
        publisher.backfillIfMissing(
          transaction,
          organizationId,
          'wiki_document',
          randomUUID(),
        ),
      );
      expect(recording.mock.calls).toHaveLength(1);
      expect(
        recording.mock.calls.filter(
          (call) =>
            z.object({ topic: z.string() }).parse(call[1]).topic ===
            KNOWLEDGE_GRAPH_SEMANTIC_CHANGED_TOPIC,
        ),
      ).toHaveLength(0);
      recording.mockClear();
      await database
        .update(outboxAggregateVersion)
        .set({ updatedAt: new Date(0) })
        .where(eq(outboxAggregateVersion.organizationId, organizationId));
      await database.transaction((transaction) =>
        publisher.requeuePendingBatch(transaction, 25),
      );
      expect(recording.mock.calls.length).toBeGreaterThan(0);
      expect(
        recording.mock.calls.filter(
          (call) =>
            z.object({ topic: z.string() }).parse(call[1]).topic ===
            KNOWLEDGE_GRAPH_SEMANTIC_CHANGED_TOPIC,
        ),
      ).toHaveLength(0);
    } finally {
      recording.mockRestore();
    }
  });
});
