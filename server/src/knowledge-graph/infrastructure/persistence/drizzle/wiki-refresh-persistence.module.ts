import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { DatabaseModule } from '@/database/database.module';
import knowledgeGraphConfig from '@/knowledge-graph/config/knowledge-graph.config';
import { WikiRefreshAcceptanceDrizzleRepository } from '@/knowledge-graph/infrastructure/persistence/drizzle/repositories/wiki-refresh-acceptance.repository';
import { RequestQuotaPersistenceModule } from '@/knowledge-graph/infrastructure/persistence/drizzle/request-quota-persistence.module';
import { WikiRefreshAcceptanceRepository } from '@/knowledge-graph/infrastructure/persistence/wiki-refresh-acceptance.repository';
import { TeamspaceGraphSourceAccessModule } from '@/knowledge-graph/infrastructure/source-access/teamspace/teamspace-graph-source-access.module';
import { SemanticRefreshModule } from '@/knowledge-graph/semantic-refresh.module';
import { OutboxInfrastructureModule } from '@/outbox/outbox.module';

@Module({
  imports: [
    ConfigModule.forFeature(knowledgeGraphConfig),
    DatabaseModule,
    OutboxInfrastructureModule,
    RequestQuotaPersistenceModule,
    SemanticRefreshModule,
    TeamspaceGraphSourceAccessModule,
  ],
  providers: [
    {
      provide: WikiRefreshAcceptanceRepository,
      useClass: WikiRefreshAcceptanceDrizzleRepository,
    },
  ],
  exports: [WikiRefreshAcceptanceRepository],
})
export class WikiRefreshPersistenceModule {}
