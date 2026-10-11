import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AuthModule } from '@/auth/auth.module';
import { TrustedOriginGuard } from '@/common/http/trusted-origin.guard';
import knowledgeGraphConfig from '@/knowledge-graph/config/knowledge-graph.config';
import { GraphCompletenessModule } from '@/knowledge-graph/graph-completeness.module';
import { GraphCuratedAssemblerService } from '@/knowledge-graph/graph-curated-assembler.service';
import { GraphExploreResultService } from '@/knowledge-graph/graph-explore-result.service';
import { GraphExploreTraversalService } from '@/knowledge-graph/graph-explore-traversal.service';
import { GraphOwnerReadService } from '@/knowledge-graph/graph-owner-read.service';
import { GraphReadAssemblerService } from '@/knowledge-graph/graph-read-assembler.service';
import { GraphSemanticAssemblerService } from '@/knowledge-graph/graph-semantic-assembler.service';
import { GraphSemanticReadService } from '@/knowledge-graph/graph-semantic-read.service';
import { KnowledgeGraphStructureReaderModule } from '@/knowledge-graph/infrastructure/graph/knowledge-graph-structure-reader.module';
import { GraphQueryPersistenceModule } from '@/knowledge-graph/infrastructure/persistence/drizzle/graph-query-persistence.module';
import { OutboxProjectionFreshnessAdapter } from '@/knowledge-graph/infrastructure/persistence/outbox/outbox-projection-freshness.adapter';
import { SemanticStatePersistenceModule } from '@/knowledge-graph/infrastructure/persistence/outbox/semantic-state-persistence.module';
import { ProjectionFreshnessRepository } from '@/knowledge-graph/infrastructure/persistence/projection-freshness.repository';
import { TeamspaceGraphSourceAccessModule } from '@/knowledge-graph/infrastructure/source-access/teamspace/teamspace-graph-source-access.module';
import { TeamspaceGraphSourceDirectoryModule } from '@/knowledge-graph/infrastructure/source-directory/teamspace/teamspace-graph-source-directory.module';
import { TeamspaceGraphSourceSnapshotModule } from '@/knowledge-graph/infrastructure/source-snapshot/teamspace/teamspace-graph-source-snapshot.module';
import { KnowledgeGraphController } from '@/knowledge-graph/knowledge-graph.controller';
import { KnowledgeGraphDetailService } from '@/knowledge-graph/knowledge-graph-detail.service';
import { KnowledgeGraphEdgeListService } from '@/knowledge-graph/knowledge-graph-edge-list.service';
import { KnowledgeGraphExploreService } from '@/knowledge-graph/knowledge-graph-explore.service';
import { KnowledgeGraphNodeListService } from '@/knowledge-graph/knowledge-graph-node-list.service';
import { KnowledgeGraphSearchModule } from '@/knowledge-graph/knowledge-graph-search.module';
import { SemanticCorrectionModule } from '@/knowledge-graph/semantic-correction.module';
import { OutboxInfrastructureModule } from '@/outbox/outbox.module';

@Module({
  imports: [
    AuthModule,
    ConfigModule.forFeature(knowledgeGraphConfig),
    GraphCompletenessModule,
    GraphQueryPersistenceModule,
    KnowledgeGraphSearchModule,
    KnowledgeGraphStructureReaderModule,
    OutboxInfrastructureModule,
    SemanticCorrectionModule,
    SemanticStatePersistenceModule,
    TeamspaceGraphSourceAccessModule,
    TeamspaceGraphSourceDirectoryModule,
    TeamspaceGraphSourceSnapshotModule,
  ],
  controllers: [KnowledgeGraphController],
  providers: [
    GraphCuratedAssemblerService,
    GraphExploreResultService,
    GraphExploreTraversalService,
    GraphOwnerReadService,
    GraphReadAssemblerService,
    GraphSemanticAssemblerService,
    GraphSemanticReadService,
    KnowledgeGraphDetailService,
    KnowledgeGraphEdgeListService,
    KnowledgeGraphExploreService,
    KnowledgeGraphNodeListService,
    TrustedOriginGuard,
    {
      provide: ProjectionFreshnessRepository,
      useClass: OutboxProjectionFreshnessAdapter,
    },
  ],
  exports: [
    KnowledgeGraphDetailService,
    KnowledgeGraphEdgeListService,
    KnowledgeGraphExploreService,
    KnowledgeGraphNodeListService,
  ],
})
export class KnowledgeGraphReadModule {}
