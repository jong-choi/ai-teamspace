import {
  BullModule,
  getQueueToken,
  Processor,
  WorkerHost,
} from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';

import type { AllConfigType } from '@/config/config.type';
import queueConfig from '@/queue/config/queue.config';
import { createWorkerRedisOptions } from '@/queue/queue.config';
import { QueueModule } from '@/queue/queue.module';

import { type Job, Queue, QueueEvents } from 'bullmq';

const TEST_QUEUE_NAME = 'test-infrastructure';
const TEST_JOB_NAME = 'ping';

@Processor(TEST_QUEUE_NAME)
class TestProcessor extends WorkerHost {
  async process(job: Job): Promise<unknown> {
    return {
      jobName: job.name,
      processedAt: new Date().toISOString(),
    };
  }
}

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [queueConfig],
      envFilePath: ['.env'],
    }),
    QueueModule.forProducer(),
    BullModule.registerQueue({ name: TEST_QUEUE_NAME }),
  ],
})
class TestProducerModule {}

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [queueConfig],
      envFilePath: ['.env'],
    }),
    QueueModule.forWorker(),
    BullModule.registerQueue({ name: TEST_QUEUE_NAME }),
  ],
  providers: [TestProcessor],
})
class TestWorkerModule {}

describe('BullMQ 큐 통합', () => {
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
    const configService = producerApp.get(ConfigService<AllConfigType>);
    const config = configService.getOrThrow('queue', { infer: true });
    const queueEvents = new QueueEvents(TEST_QUEUE_NAME, {
      connection: createWorkerRedisOptions(config.redisUrl),
      prefix: config.prefix,
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
        jobName: TEST_JOB_NAME,
        processedAt: expect.any(String),
      });
    } finally {
      await queueEvents.close();
      await workerApp.close();
      await producerApp.close();
    }
  });
});
