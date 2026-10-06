import { BullModule } from '@nestjs/bullmq';
import { DynamicModule, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';

import type { AllConfigType } from '@/config/config.type';
import {
  createProducerRedisOptions,
  createWorkerRedisOptions,
  DEFAULT_JOB_OPTIONS,
} from '@/queue/queue.config';

@Module({})
export class QueueModule {
  static forProducer(): DynamicModule {
    return {
      module: QueueModule,
      imports: [
        BullModule.forRootAsync({
          imports: [ConfigModule],
          inject: [ConfigService],
          useFactory: (configService: ConfigService<AllConfigType>) => {
            const config = configService.getOrThrow('queue', { infer: true });
            return {
              prefix: config.prefix,
              connection: createProducerRedisOptions(config.redisUrl),
              defaultJobOptions: DEFAULT_JOB_OPTIONS,
            };
          },
        }),
      ],
      exports: [BullModule],
    };
  }

  static forWorker(): DynamicModule {
    return {
      module: QueueModule,
      imports: [
        BullModule.forRootAsync({
          imports: [ConfigModule],
          inject: [ConfigService],
          useFactory: (configService: ConfigService<AllConfigType>) => {
            const config = configService.getOrThrow('queue', { infer: true });
            return {
              prefix: config.prefix,
              connection: createWorkerRedisOptions(config.redisUrl),
              defaultJobOptions: DEFAULT_JOB_OPTIONS,
            };
          },
        }),
      ],
      exports: [BullModule],
    };
  }
}
