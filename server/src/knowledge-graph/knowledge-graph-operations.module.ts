import { Module } from '@nestjs/common';

import { AuthModule } from '@/auth/auth.module';
import { TrustedOriginGuard } from '@/common/http/trusted-origin.guard';
import { GraphCompletenessModule } from '@/knowledge-graph/graph-completeness.module';
import { GraphRebuildService } from '@/knowledge-graph/graph-rebuild.service';
import { GraphRebuildPersistenceModule } from '@/knowledge-graph/infrastructure/persistence/drizzle/graph-rebuild-persistence.module';
import { WorkosGraphSourceAccessModule } from '@/knowledge-graph/infrastructure/source-access/workos/workos-graph-source-access.module';
import { KnowledgeGraphOperationsController } from '@/knowledge-graph/knowledge-graph-operations.controller';
import { OutboxInfrastructureModule } from '@/outbox/outbox.module';

@Module({
  imports: [
    AuthModule,
    GraphCompletenessModule,
    GraphRebuildPersistenceModule,
    OutboxInfrastructureModule,
    WorkosGraphSourceAccessModule,
  ],
  controllers: [KnowledgeGraphOperationsController],
  providers: [GraphRebuildService, TrustedOriginGuard],
  exports: [GraphRebuildService],
})
export class KnowledgeGraphOperationsModule {}
