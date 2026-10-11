import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AuthModule } from '@/auth/auth.module';
import { TrustedOriginGuard } from '@/common/http/trusted-origin.guard';
import knowledgeGraphConfig from '@/knowledge-graph/config/knowledge-graph.config';
import { GraphCompletenessModule } from '@/knowledge-graph/graph-completeness.module';
import { GeminiEmbedding2Module } from '@/knowledge-graph/infrastructure/embedding/gemini/gemini-embedding-2.module';
import { KnowledgeGraphSemanticSearchReaderModule } from '@/knowledge-graph/infrastructure/graph/knowledge-graph-semantic-search-reader.module';
import { SearchQuotaPersistenceModule } from '@/knowledge-graph/infrastructure/persistence/drizzle/search-quota-persistence.module';
import { SemanticStatePersistenceModule } from '@/knowledge-graph/infrastructure/persistence/outbox/semantic-state-persistence.module';
import { TeamspaceGraphSourceAccessModule } from '@/knowledge-graph/infrastructure/source-access/teamspace/teamspace-graph-source-access.module';
import { TeamspaceGraphSourceSnapshotModule } from '@/knowledge-graph/infrastructure/source-snapshot/teamspace/teamspace-graph-source-snapshot.module';
import { KnowledgeGraphSearchController } from '@/knowledge-graph/knowledge-graph-search.controller';
import { KnowledgeGraphSearchService } from '@/knowledge-graph/knowledge-graph-search.service';

@Module({
  imports: [
    AuthModule,
    ConfigModule.forFeature(knowledgeGraphConfig),
    GeminiEmbedding2Module,
    GraphCompletenessModule,
    KnowledgeGraphSemanticSearchReaderModule,
    SearchQuotaPersistenceModule,
    SemanticStatePersistenceModule,
    TeamspaceGraphSourceAccessModule,
    TeamspaceGraphSourceSnapshotModule,
  ],
  controllers: [KnowledgeGraphSearchController],
  providers: [KnowledgeGraphSearchService, TrustedOriginGuard],
  exports: [KnowledgeGraphSearchService],
})
export class KnowledgeGraphSearchModule {}
