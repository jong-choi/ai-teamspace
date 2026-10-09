import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import knowledgeGraphConfig from '@/knowledge-graph/config/knowledge-graph.config';
import { KnowledgeGraphSemanticSearchReader } from '@/knowledge-graph/infrastructure/graph/knowledge-graph-semantic-search-reader.provider';
import { LangchainNeo4jSemanticSearchReaderAdapter } from '@/knowledge-graph/infrastructure/graph/langchain-neo4j-semantic-search-reader.adapter';

@Module({
  imports: [ConfigModule.forFeature(knowledgeGraphConfig)],
  providers: [
    {
      provide: KnowledgeGraphSemanticSearchReader,
      useClass: LangchainNeo4jSemanticSearchReaderAdapter,
    },
  ],
  exports: [KnowledgeGraphSemanticSearchReader],
})
export class KnowledgeGraphSemanticSearchReaderModule {}
