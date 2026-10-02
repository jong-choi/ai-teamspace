import {
  BullModule,
  getQueueToken,
  Processor,
  WorkerHost,
} from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import {
  parseCacheEnvironment,
  parseQueueEnvironment,
} from '#server-source/config/runtime-environment';
import { createWorkerRedisOptions } from '#server-source/queue/queue.config';
import { QueueModule } from '#server-source/queue/queue.module';

import { type Job, Queue, QueueEvents } from 'bullmq';
import { Redis } from 'ioredis';

const TEST_QUEUE_NAME = 'test-infrastructure';
const TEST_JOB_NAME = 'ping';

@Processor(TEST_QUEUE_NAME)
class TestProcessor extends WorkerHost {
  async process(job: Job): Promise<unknown> {
    expect(job.name).toBe(TEST_JOB_NAME);

    return {
      processedAt: new Date().toISOString(),
    };
  }
}

@Module({
  imports: [
    QueueModule.forProducer(),
    BullModule.registerQueue({ name: TEST_QUEUE_NAME }),
  ],
})
class TestProducerModule {}

@Module({
  imports: [
    QueueModule.forWorker(),
    BullModule.registerQueue({ name: TEST_QUEUE_NAME }),
  ],
  providers: [TestProcessor],
})
class TestWorkerModule {}

describe('Redis 인프라 통합', () => {
  it('cache Redis에 연결해 PONG을 받는다', async () => {
    const { REDIS_CACHE_URL } = parseCacheEnvironment();
    const client = new Redis(REDIS_CACHE_URL, {
      enableOfflineQueue: false,
      lazyConnect: true,
      maxRetriesPerRequest: 1,
    });

    try {
      await client.connect();
      await expect(client.ping()).resolves.toBe('PONG');
    } finally {
      await client.quit();
    }
  });

  it('분리된 producer와 worker가 BullMQ 작업을 처리한다', async () => {
    const producerApp = await NestFactory.createApplicationContext(
      TestProducerModule,
      { logger: false },
    );
    const workerApp = await NestFactory.createApplicationContext(
      TestWorkerModule,
      { logger: false },
    );
    const queue = producerApp.get<Queue>(getQueueToken(TEST_QUEUE_NAME));
    const { BULLMQ_PREFIX, REDIS_QUEUE_URL } = parseQueueEnvironment();
    const queueEvents = new QueueEvents(TEST_QUEUE_NAME, {
      connection: createWorkerRedisOptions(REDIS_QUEUE_URL),
      prefix: BULLMQ_PREFIX,
    });

    try {
      await queueEvents.waitUntilReady();
      const job = await queue.add(
        TEST_JOB_NAME,
        {},
        { removeOnComplete: true },
      );
      const result = await job.waitUntilFinished(queueEvents, 5_000);

      expect(result).toEqual({
        processedAt: expect.any(String),
      });
    } finally {
      await queueEvents.close();
      await workerApp.close();
      await producerApp.close();
    }
  });
});
