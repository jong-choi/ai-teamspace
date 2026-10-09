import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { KnowledgeGraphSemanticOutboxTransport } from '@/jobs/knowledge-graph/knowledge-graph-semantic-outbox.transport';
import { KnowledgeGraphSemanticQueueModule } from '@/jobs/knowledge-graph/knowledge-graph-semantic-queue.module';
import knowledgeGraphConfig from '@/knowledge-graph/config/knowledge-graph.config';
import { SemanticStatePersistenceModule } from '@/knowledge-graph/infrastructure/persistence/outbox/semantic-state-persistence.module';
import { SemanticDeliveryService } from '@/knowledge-graph/semantic-delivery.service';

@Module({
  imports: [
    ConfigModule.forFeature(knowledgeGraphConfig),
    SemanticStatePersistenceModule,
    KnowledgeGraphSemanticQueueModule,
  ],
  providers: [SemanticDeliveryService, KnowledgeGraphSemanticOutboxTransport],
  exports: [KnowledgeGraphSemanticOutboxTransport],
})
export class KnowledgeGraphSemanticOutboxTransportModule {}
