import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import knowledgeGraphConfig from '@/knowledge-graph/config/knowledge-graph.config';
import { LangchainNeo4jSemanticGraphReaderAdapter } from '@/knowledge-graph/infrastructure/graph/langchain-neo4j-semantic-graph-reader.adapter';
import { SemanticGraphReader } from '@/knowledge-graph/infrastructure/graph/semantic-graph-reader.provider';
import { SemanticCorrectionPersistenceModule } from '@/knowledge-graph/infrastructure/persistence/drizzle/semantic-correction-persistence.module';
import { SemanticStatePersistenceModule } from '@/knowledge-graph/infrastructure/persistence/outbox/semantic-state-persistence.module';
import { SemanticCorrectionService } from '@/knowledge-graph/semantic-correction.service';

@Module({
  imports: [
    ConfigModule.forFeature(knowledgeGraphConfig),
    SemanticCorrectionPersistenceModule,
    SemanticStatePersistenceModule,
  ],
  providers: [
    {
      provide: SemanticGraphReader,
      useClass: LangchainNeo4jSemanticGraphReaderAdapter,
    },
    SemanticCorrectionService,
  ],
  exports: [SemanticCorrectionService],
})
export class SemanticCorrectionModule {}
