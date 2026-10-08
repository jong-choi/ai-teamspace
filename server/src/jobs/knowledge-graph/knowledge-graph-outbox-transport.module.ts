import { Logger, Module } from '@nestjs/common';
import { ConfigModule, type ConfigType } from '@nestjs/config';

import { KnowledgeGraphOutboxTransport } from '@/jobs/knowledge-graph/knowledge-graph-outbox.transport';
import { KNOWLEDGE_GRAPH_PROJECTION_QUEUE } from '@/jobs/knowledge-graph/knowledge-graph-projection.job';
import queueConfig from '@/queue/config/queue.config';
import {
  createProducerRedisOptions,
  DEFAULT_JOB_OPTIONS,
} from '@/queue/queue.config';

import { Queue } from 'bullmq';
import { Redis } from 'ioredis';

@Module({
  imports: [ConfigModule.forFeature(queueConfig)],
  providers: [
    {
      provide: KnowledgeGraphOutboxTransport,
      inject: [queueConfig.KEY],
      useFactory: (config: ConfigType<typeof queueConfig>) => {
        const connection = new Redis({
          ...createProducerRedisOptions(config.redisUrl),
          connectTimeout: 5_000,
          commandTimeout: 5_000,
        });
        connection.on('error', () => {});
        const queue = new Queue(KNOWLEDGE_GRAPH_PROJECTION_QUEUE, {
          prefix: config.prefix,
          connection,
          defaultJobOptions: DEFAULT_JOB_OPTIONS,
        });
        const logger = new Logger(KnowledgeGraphOutboxTransport.name);
        queue.on('error', () =>
          logger.warn('KNOWLEDGE_GRAPH_OUTBOX_QUEUE_CONNECTION_FAILED'),
        );
        return new KnowledgeGraphOutboxTransport(queue, connection);
      },
    },
  ],
  exports: [KnowledgeGraphOutboxTransport],
})
export class KnowledgeGraphOutboxTransportModule {}
