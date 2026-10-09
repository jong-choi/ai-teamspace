import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import knowledgeGraphConfig from '@/knowledge-graph/config/knowledge-graph.config';
import { KnowledgeGraphStructureReader } from '@/knowledge-graph/infrastructure/graph/knowledge-graph-structure-reader.provider';
import { LangchainNeo4jGraphStructureReaderAdapter } from '@/knowledge-graph/infrastructure/graph/langchain-neo4j-graph-structure-reader.adapter';

@Module({
  imports: [ConfigModule.forFeature(knowledgeGraphConfig)],
  providers: [
    {
      provide: KnowledgeGraphStructureReader,
      useClass: LangchainNeo4jGraphStructureReaderAdapter,
    },
  ],
  exports: [KnowledgeGraphStructureReader],
})
export class KnowledgeGraphStructureReaderModule {}
