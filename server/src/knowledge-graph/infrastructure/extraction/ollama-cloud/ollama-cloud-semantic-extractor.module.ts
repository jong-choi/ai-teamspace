import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import knowledgeGraphConfig from '@/knowledge-graph/config/knowledge-graph.config';
import { OllamaCloudSemanticExtractorAdapter } from '@/knowledge-graph/infrastructure/extraction/ollama-cloud/ollama-cloud-semantic-extractor.adapter';
import { SemanticGraphExtractor } from '@/knowledge-graph/infrastructure/extraction/semantic-graph-extractor.provider';

@Module({
  imports: [ConfigModule.forFeature(knowledgeGraphConfig)],
  providers: [
    {
      provide: SemanticGraphExtractor,
      useClass: OllamaCloudSemanticExtractorAdapter,
    },
  ],
  exports: [SemanticGraphExtractor],
})
export class OllamaCloudSemanticExtractorModule {}
