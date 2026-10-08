import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { promisify } from 'node:util';

import { ConfigModule } from '@nestjs/config';
import { Outbox, OutboxRelay, OutboxStorage } from '@nestjs/outbox';
import { fromDrizzle, PostgresOutboxStore } from '@nestjs/outbox/postgres';
import { Test, type TestingModule } from '@nestjs/testing';

import databaseConfig from '@/database/config/database.config';
import { DatabaseModule } from '@/database/database.module';
import { DatabaseService } from '@/database/database.service';
import { KnowledgeGraphOutboxTransport } from '@/jobs/knowledge-graph/knowledge-graph-outbox.transport';
import { KnowledgeGraphOutboxTransportModule } from '@/jobs/knowledge-graph/knowledge-graph-outbox-transport.module';
import { KNOWLEDGE_GRAPH_PROJECTION_QUEUE } from '@/jobs/knowledge-graph/knowledge-graph-projection.job';
import { outboxAggregateVersion } from '@/outbox/infrastructure/persistence/drizzle/schema/outbox-aggregate-version.schema';
import {
  KNOWLEDGE_GRAPH_OUTBOX_TOPIC,
  OutboxAggregateChangePublisher,
} from '@/outbox/outbox-aggregate-change.publisher';
import { OutboxAggregateEventSchema } from '@/outbox/outbox-aggregate-event.schema';
import queueConfig from '@/queue/config/queue.config';
import { createWorkerRedisOptions } from '@/queue/queue.config';

import { waitForCondition } from '@test/agent/support/workos-agent.e2e-support';
import { Queue } from 'bullmq';
import { eq } from 'drizzle-orm';

const run = promisify(execFile);
const redisContainer = process.env.KG_TEST_REDIS_CONTAINER;
const outageTest = redisContainer ? it : it.skip;

describe('PostgreSQL Outbox와 BullMQ의 실제 전달', () => {
  const organizationId = `kg-delivery-${randomUUID()}`;
  const originalPrefix = process.env.BULLMQ_PREFIX;
  let moduleRef: TestingModule;
  let database: DatabaseService['db'];
  let transport: KnowledgeGraphOutboxTransport;
  let queue: Queue;
  let store: PostgresOutboxStore;
  let relay: OutboxRelay;
  let outbox: Outbox;
  let events: OutboxAggregateChangePublisher;

  beforeAll(async () => {
    process.env.BULLMQ_PREFIX = `kg-delivery-${randomUUID()}`;
    moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [databaseConfig, queueConfig],
        }),
        DatabaseModule,
        KnowledgeGraphOutboxTransportModule,
      ],
    }).compile();
    await moduleRef.init();
    database = moduleRef.get(DatabaseService).db;
    transport = moduleRef.get(KnowledgeGraphOutboxTransport);
    const config = await queueConfig();
    queue = new Queue(KNOWLEDGE_GRAPH_PROJECTION_QUEUE, {
      prefix: config.prefix,
      connection: createWorkerRedisOptions(config.redisUrl),
    });
    queue.on('error', () => {});
    await queue.waitUntilReady();
  });

  beforeEach(async () => {
    const storage = new OutboxStorage();
    // 라이브러리 소유 schema만 별도 namespace로 격리한다. 제품 migration은 이미 적용된 DB를 사용한다.
    store = new PostgresOutboxStore(
      {
        executor: fromDrizzle(database),
        schema: `kg_delivery_${randomUUID().replaceAll('-', '_')}`,
        migrate: true,
      },
      storage,
    );
    await store.onModuleInit();
    relay = createRelay();
    outbox = new Outbox(storage, relay);
    events = new OutboxAggregateChangePublisher(outbox);
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await relay?.stop();
    await queue?.drain(true);
    await database
      .delete(outboxAggregateVersion)
      .where(eq(outboxAggregateVersion.organizationId, organizationId));
  });

  afterAll(async () => {
    try {
      await queue?.close();
      await moduleRef?.close();
    } finally {
      if (originalPrefix === undefined) delete process.env.BULLMQ_PREFIX;
      else process.env.BULLMQ_PREFIX = originalPrefix;
    }
  });

  function createRelay() {
    return new OutboxRelay({
      store,
      transports: { knowledgeGraph: transport },
      route: () => 'knowledgeGraph',
      relay: {
        enabled: false,
        batchSize: 20,
        lease: '2s',
        publishTimeout: '500ms',
      },
      retry: {
        attempts: 3,
        backoff: { delay: '20ms', factor: 1, jitter: 'none' },
      },
      logger: { log: () => {}, error: () => {}, warn: () => {} },
    });
  }

  async function record(id = 'wiki-one') {
    await database.transaction((transaction) =>
      events.wikiChanged(transaction, organizationId, id, 'changed'),
    );
  }

  it('producer의 PG commit은 API relay OFF에서 기다리고 실제 relay가 broker 접수 후 확인한다', async () => {
    expect(relay.running).toBe(false);
    await record();
    expect((await relay.stats()).pending).toBe(1);
    expect(await queue.getWaitingCount()).toBe(0);
    const published = jest.spyOn(transport, 'publish');
    expect(await relay.runOnce()).toMatchObject({ claimed: 1, published: 1 });
    const message = published.mock.calls[0]?.[0];
    if (!message) throw new Error('전달된 Outbox가 없습니다.');
    expect((await queue.getJob(message.id))?.data).toMatchObject({
      organizationId,
      aggregateKind: 'wiki_document',
      sourceVersion: 1,
    });
    expect((await relay.stats()).pending).toBe(0);
  });

  it('broker 접수 후 PG 확인 전 crash와 재전달은 같은 jobId 한 개로 수렴한다', async () => {
    await record();
    const confirm = jest
      .spyOn(store, 'markPublished')
      .mockRejectedValueOnce(new Error('확인 이전 crash'));
    expect(await relay.runOnce()).toMatchObject({
      claimed: 1,
      published: 0,
      leaseLost: 1,
    });
    expect(await queue.getWaitingCount()).toBe(1);
    expect((await relay.stats()).pending).toBe(1);
    confirm.mockRestore();
    const recovered = await store.claim({
      owner: 'takeover',
      now: Date.now() + 2_001,
      leaseMs: 2_000,
      limit: 20,
    });
    expect(recovered).toHaveLength(1);
    await store.release(
      recovered.map((message) => message.id),
      'takeover',
    );
    expect(await relay.runOnce()).toMatchObject({ claimed: 1, published: 1 });
    expect(await queue.getWaitingCount()).toBe(1);
    expect((await relay.stats()).pending).toBe(0);
  });

  it('두 relay가 같은 key를 동시에 claim해도 원본 버전은 한 번씩 순서대로 전달된다', async () => {
    await record();
    await record();
    await record();
    const publish = jest.spyOn(transport, 'publish');
    const second = createRelay();
    try {
      const results = await Promise.all([relay.runOnce(), second.runOnce()]);
      expect(results.reduce((sum, result) => sum + result.published, 0)).toBe(
        3,
      );
      expect(
        publish.mock.calls.map(
          ([message]) =>
            OutboxAggregateEventSchema.parse(message.payload).sourceVersion,
        ),
      ).toEqual([1, 2, 3]);
      expect(
        (await queue.getWaiting()).map((job) => job.data.sourceVersion).sort(),
      ).toEqual([1, 2, 3]);
      expect((await relay.stats()).pending).toBe(0);
    } finally {
      await second.stop();
    }
  });

  it('만료된 lease를 재획득한 뒤에는 이전 owner의 publish 확인을 거부한다', async () => {
    await record();
    const now = Date.now();
    const first = await store.claim({
      owner: 'old-owner',
      now,
      leaseMs: 2_000,
      limit: 20,
    });
    const second = await store.claim({
      owner: 'new-owner',
      now: now + 2_001,
      leaseMs: 2_000,
      limit: 20,
    });
    expect(first).toHaveLength(1);
    expect(second).toHaveLength(1);
    expect(first[0]?.id).toBe(second[0]?.id);
    expect(await store.markPublished(second[0].id, 'old-owner')).toBe(false);
    expect(await store.markPublished(second[0].id, 'new-owner')).toBe(true);
  });

  it('잘못된 payload는 broker에 전달하지 않고 PG dead letter에 남긴다', async () => {
    const message = await database.transaction(async (transaction) =>
      outbox.add(transaction, {
        topic: KNOWLEDGE_GRAPH_OUTBOX_TOPIC,
        key: 'invalid',
        payload: { sourceVersion: -1 },
      }),
    );
    expect(await relay.runOnce()).toMatchObject({
      deadLettered: 1,
      published: 0,
    });
    expect(await queue.getWaitingCount()).toBe(0);
    expect(await store.getDeadLetter(message.id)).toMatchObject({
      reason: 'rejected',
      attempts: 1,
      lastError:
        'NonRetryableMessageError: KNOWLEDGE_GRAPH_OUTBOX_PAYLOAD_INVALID',
    });
  });

  outageTest(
    '실제 Redis 중단 중에는 PG 의도를 유지하고 복구 뒤 전달한다',
    async () => {
      if (redisContainer !== 'workos-graph-verification-redis')
        throw new Error('전용 검증 Redis만 중단할 수 있습니다.');
      await record();
      await run('docker', ['pause', redisContainer]);
      try {
        expect(await relay.runOnce()).toMatchObject({
          retried: 1,
          published: 0,
        });
        expect((await relay.stats()).pending).toBe(1);
      } finally {
        await run('docker', ['unpause', redisContainer]);
      }
      await waitForCondition(
        async () => (await relay.runOnce()).published === 1,
        'Redis 복구 후 영속 Outbox를 전달하지 못했습니다.',
        { timeoutMs: 10_000 },
      );
      expect((await relay.stats()).pending).toBe(0);
      expect(await queue.getWaitingCount()).toBe(1);
    },
  );
});
