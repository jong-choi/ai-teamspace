import { BullModule } from '@nestjs/bullmq';
import { DynamicModule, Module } from '@nestjs/common';

import { parseQueueEnvironment } from '@/config/runtime-environment';
import {
  createProducerRedisOptions,
  createWorkerRedisOptions,
  DEFAULT_JOB_OPTIONS,
} from '@/queue/queue.config';

@Module({})
export class QueueModule {
  static forProducer(): DynamicModule {
    const { BULLMQ_PREFIX, REDIS_QUEUE_URL } = parseQueueEnvironment();

    return {
      module: QueueModule,
      imports: [
        BullModule.forRoot({
          prefix: BULLMQ_PREFIX,
          connection: createProducerRedisOptions(REDIS_QUEUE_URL),
          defaultJobOptions: DEFAULT_JOB_OPTIONS,
        }),
      ],
      exports: [BullModule],
    };
  }

  static forWorker(): DynamicModule {
    const { BULLMQ_PREFIX, REDIS_QUEUE_URL } = parseQueueEnvironment();

    return {
      module: QueueModule,
      imports: [
        BullModule.forRoot({
          prefix: BULLMQ_PREFIX,
          connection: createWorkerRedisOptions(REDIS_QUEUE_URL),
          defaultJobOptions: DEFAULT_JOB_OPTIONS,
        }),
      ],
      exports: [BullModule],
    };
  }
}
