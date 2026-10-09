import { Logger, Module } from '@nestjs/common';
import { ConfigModule, type ConfigType } from '@nestjs/config';

import { KNOWLEDGE_GRAPH_REBUILD_QUEUE } from '@/jobs/knowledge-graph/knowledge-graph-rebuild.job';
import { KnowledgeGraphRebuildOutboxTransport } from '@/jobs/knowledge-graph/knowledge-graph-rebuild-outbox.transport';
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
      provide: KnowledgeGraphRebuildOutboxTransport,
      inject: [queueConfig.KEY],
      useFactory: (config: ConfigType<typeof queueConfig>) => {
        const connection = new Redis({
          ...createProducerRedisOptions(config.redisUrl),
          connectTimeout: 5_000,
          commandTimeout: 5_000,
        });
        connection.on('error', () => {});
        const queue = new Queue(KNOWLEDGE_GRAPH_REBUILD_QUEUE, {
          prefix: config.prefix,
          connection,
          defaultJobOptions: DEFAULT_JOB_OPTIONS,
        });
        const logger = new Logger(KnowledgeGraphRebuildOutboxTransport.name);
        queue.on('error', () =>
          logger.warn('KG_REBUILD_OUTBOX_QUEUE_CONNECTION_FAILED'),
        );
        return new KnowledgeGraphRebuildOutboxTransport(queue, connection);
      },
    },
  ],
  exports: [KnowledgeGraphRebuildOutboxTransport],
})
export class KnowledgeGraphRebuildOutboxTransportModule {}
