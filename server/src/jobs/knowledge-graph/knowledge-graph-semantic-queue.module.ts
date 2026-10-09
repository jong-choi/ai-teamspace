import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { KnowledgeGraphSemanticQueueAdapter } from '@/jobs/knowledge-graph/knowledge-graph-semantic-queue.adapter';
import {
  createSemanticProducerResources,
  SEMANTIC_PRODUCER_RESOURCES,
} from '@/jobs/knowledge-graph/knowledge-graph-semantic-queue.resources';
import knowledgeGraphConfig from '@/knowledge-graph/config/knowledge-graph.config';
import { SemanticJobQueueProvider } from '@/knowledge-graph/infrastructure/queue/semantic-job-queue.provider';
import queueConfig from '@/queue/config/queue.config';

@Module({
  imports: [
    ConfigModule.forFeature(knowledgeGraphConfig),
    ConfigModule.forFeature(queueConfig),
  ],
  providers: [
    {
      provide: SEMANTIC_PRODUCER_RESOURCES,
      inject: [knowledgeGraphConfig.KEY, queueConfig.KEY],
      useFactory: createSemanticProducerResources,
    },
    {
      provide: SemanticJobQueueProvider,
      useClass: KnowledgeGraphSemanticQueueAdapter,
    },
  ],
  exports: [SemanticJobQueueProvider],
})
export class KnowledgeGraphSemanticQueueModule {}
