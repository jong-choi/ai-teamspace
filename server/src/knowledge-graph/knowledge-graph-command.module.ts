import { Module } from '@nestjs/common';

import { AuthModule } from '@/auth/auth.module';
import { TrustedOriginGuard } from '@/common/http/trusted-origin.guard';
import { CuratedGraphModule } from '@/knowledge-graph/curated-graph.module';
import { GraphCommandService } from '@/knowledge-graph/graph-command.service';
import { GraphCorrectionCommandService } from '@/knowledge-graph/graph-correction-command.service';
import { GraphIndexStatusService } from '@/knowledge-graph/graph-index-status.service';
import { GraphCorrectionCommandPersistenceModule } from '@/knowledge-graph/infrastructure/persistence/drizzle/graph-correction-command-persistence.module';
import { GraphQueryPersistenceModule } from '@/knowledge-graph/infrastructure/persistence/drizzle/graph-query-persistence.module';
import { WikiRefreshPersistenceModule } from '@/knowledge-graph/infrastructure/persistence/drizzle/wiki-refresh-persistence.module';
import { SemanticStatePersistenceModule } from '@/knowledge-graph/infrastructure/persistence/outbox/semantic-state-persistence.module';
import { WorkosGraphSourceAccessModule } from '@/knowledge-graph/infrastructure/source-access/workos/workos-graph-source-access.module';
import { WorkosGraphSourceSnapshotModule } from '@/knowledge-graph/infrastructure/source-snapshot/workos/workos-graph-source-snapshot.module';
import { KnowledgeGraphCommandController } from '@/knowledge-graph/knowledge-graph-command.controller';
import { SemanticCorrectionModule } from '@/knowledge-graph/semantic-correction.module';
import { WikiKnowledgeGraphController } from '@/knowledge-graph/wiki-knowledge-graph.controller';
import { WikiRefreshService } from '@/knowledge-graph/wiki-refresh.service';
import { WikiProjectionQueryModule } from '@/wiki/wiki-projection-query.module';

@Module({
  imports: [
    AuthModule,
    CuratedGraphModule,
    GraphCorrectionCommandPersistenceModule,
    GraphQueryPersistenceModule,
    SemanticCorrectionModule,
    SemanticStatePersistenceModule,
    WikiProjectionQueryModule,
    WikiRefreshPersistenceModule,
    WorkosGraphSourceAccessModule,
    WorkosGraphSourceSnapshotModule,
  ],
  controllers: [WikiKnowledgeGraphController, KnowledgeGraphCommandController],
  providers: [
    GraphCommandService,
    GraphCorrectionCommandService,
    GraphIndexStatusService,
    TrustedOriginGuard,
    WikiRefreshService,
  ],
})
export class KnowledgeGraphCommandModule {}
