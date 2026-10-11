import { Module } from '@nestjs/common';

import { AuthModule } from '@/auth/auth.module';
import { TrustedOriginGuard } from '@/common/http/trusted-origin.guard';
import { GraphCompletenessModule } from '@/knowledge-graph/graph-completeness.module';
import { GraphRebuildService } from '@/knowledge-graph/graph-rebuild.service';
import { GraphRebuildPersistenceModule } from '@/knowledge-graph/infrastructure/persistence/drizzle/graph-rebuild-persistence.module';
import { GraphRebuildProgressPersistenceModule } from '@/knowledge-graph/infrastructure/persistence/outbox/graph-rebuild-progress-persistence.module';
import { TeamspaceGraphSourceAccessModule } from '@/knowledge-graph/infrastructure/source-access/teamspace/teamspace-graph-source-access.module';
import { KnowledgeGraphOperationsController } from '@/knowledge-graph/knowledge-graph-operations.controller';

@Module({
  imports: [
    AuthModule,
    GraphCompletenessModule,
    GraphRebuildPersistenceModule,
    GraphRebuildProgressPersistenceModule,
    TeamspaceGraphSourceAccessModule,
  ],
  controllers: [KnowledgeGraphOperationsController],
  providers: [GraphRebuildService, TrustedOriginGuard],
  exports: [GraphRebuildService],
})
export class KnowledgeGraphOperationsModule {}
