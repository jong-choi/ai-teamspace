import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { KnowledgeGraphJobsModule } from '@/jobs/knowledge-graph/knowledge-graph-jobs.module';
import { KNOWLEDGE_GRAPH_SEMANTIC_QUEUE } from '@/jobs/knowledge-graph/knowledge-graph-semantic.job';
import { KnowledgeGraphSemanticProcessor } from '@/jobs/knowledge-graph/knowledge-graph-semantic.processor';
import { KnowledgeGraphSemanticQueueModule } from '@/jobs/knowledge-graph/knowledge-graph-semantic-queue.module';
import { KnowledgeGraphSemanticReconciliationScheduler } from '@/jobs/knowledge-graph/knowledge-graph-semantic-reconciliation.scheduler';
import knowledgeGraphConfig from '@/knowledge-graph/config/knowledge-graph.config';
import { MarkdownSemanticChunkerAdapter } from '@/knowledge-graph/infrastructure/chunking/markdown/markdown-semantic-chunker.adapter';
import { SemanticChunkerProvider } from '@/knowledge-graph/infrastructure/chunking/semantic-chunker.provider';
import { GeminiEmbedding2Module } from '@/knowledge-graph/infrastructure/embedding/gemini/gemini-embedding-2.module';
import { OllamaCloudSemanticExtractorModule } from '@/knowledge-graph/infrastructure/extraction/ollama-cloud/ollama-cloud-semantic-extractor.module';
import { LangchainNeo4jSemanticGraphAdapter } from '@/knowledge-graph/infrastructure/graph/langchain-neo4j-semantic-graph.adapter';
import { SemanticGraphStore } from '@/knowledge-graph/infrastructure/graph/semantic-graph-store.provider';
import { SemanticStatePersistenceModule } from '@/knowledge-graph/infrastructure/persistence/outbox/semantic-state-persistence.module';
import { SemanticIngestionService } from '@/knowledge-graph/semantic-ingestion.service';
import { SemanticReconciliationService } from '@/knowledge-graph/semantic-reconciliation.service';
import { QueueModule } from '@/queue/queue.module';

@Module({
  imports: [
    ConfigModule.forFeature(knowledgeGraphConfig),
    SemanticStatePersistenceModule,
    KnowledgeGraphJobsModule,
    QueueModule.forWorker(),
    BullModule.registerQueue({ name: KNOWLEDGE_GRAPH_SEMANTIC_QUEUE }),
    KnowledgeGraphSemanticQueueModule,
    OllamaCloudSemanticExtractorModule,
    GeminiEmbedding2Module,
  ],
  providers: [
    {
      provide: SemanticChunkerProvider,
      useClass: MarkdownSemanticChunkerAdapter,
    },
    {
      provide: SemanticGraphStore,
      useClass: LangchainNeo4jSemanticGraphAdapter,
    },
    SemanticIngestionService,
    SemanticReconciliationService,
    KnowledgeGraphSemanticProcessor,
    KnowledgeGraphSemanticReconciliationScheduler,
  ],
  exports: [SemanticIngestionService],
})
export class KnowledgeGraphSemanticJobsModule {}
