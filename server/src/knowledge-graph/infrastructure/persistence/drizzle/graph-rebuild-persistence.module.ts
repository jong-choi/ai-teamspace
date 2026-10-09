import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { DatabaseModule } from '@/database/database.module';
import knowledgeGraphConfig from '@/knowledge-graph/config/knowledge-graph.config';
import { GraphOperationsDrizzleRepository } from '@/knowledge-graph/infrastructure/persistence/drizzle/repositories/graph-operations.repository';
import { GraphRebuildRequestDrizzleRepository } from '@/knowledge-graph/infrastructure/persistence/drizzle/repositories/graph-rebuild-request.repository';
import { GraphRebuildWorkerDrizzleRepository } from '@/knowledge-graph/infrastructure/persistence/drizzle/repositories/graph-rebuild-worker.repository';
import { RequestQuotaPersistenceModule } from '@/knowledge-graph/infrastructure/persistence/drizzle/request-quota-persistence.module';
import { GraphOperationsRepository } from '@/knowledge-graph/infrastructure/persistence/graph-operations.repository';
import {
  GraphRebuildRequestRepository,
  GraphRebuildWorkerRepository,
} from '@/knowledge-graph/infrastructure/persistence/graph-rebuild-request.repository';
import { WorkosGraphSourceAccessModule } from '@/knowledge-graph/infrastructure/source-access/workos/workos-graph-source-access.module';
import { SemanticRefreshModule } from '@/knowledge-graph/semantic-refresh.module';
import { OutboxInfrastructureModule } from '@/outbox/outbox.module';

@Module({
  imports: [
    ConfigModule.forFeature(knowledgeGraphConfig),
    DatabaseModule,
    OutboxInfrastructureModule,
    RequestQuotaPersistenceModule,
    SemanticRefreshModule,
    WorkosGraphSourceAccessModule,
  ],
  providers: [
    {
      provide: GraphRebuildRequestRepository,
      useClass: GraphRebuildRequestDrizzleRepository,
    },
    {
      provide: GraphRebuildWorkerRepository,
      useClass: GraphRebuildWorkerDrizzleRepository,
    },
    {
      provide: GraphOperationsRepository,
      useClass: GraphOperationsDrizzleRepository,
    },
  ],
  exports: [
    GraphRebuildRequestRepository,
    GraphRebuildWorkerRepository,
    GraphOperationsRepository,
  ],
})
export class GraphRebuildPersistenceModule {}
