import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import knowledgeGraphConfig from '@/knowledge-graph/config/knowledge-graph.config';
import { GeminiEmbedding2Adapter } from '@/knowledge-graph/infrastructure/embedding/gemini/gemini-embedding-2.adapter';
import { SemanticEmbedder } from '@/knowledge-graph/infrastructure/embedding/semantic-embedder.provider';

@Module({
  imports: [ConfigModule.forFeature(knowledgeGraphConfig)],
  providers: [{ provide: SemanticEmbedder, useClass: GeminiEmbedding2Adapter }],
  exports: [SemanticEmbedder],
})
export class GeminiEmbedding2Module {}
