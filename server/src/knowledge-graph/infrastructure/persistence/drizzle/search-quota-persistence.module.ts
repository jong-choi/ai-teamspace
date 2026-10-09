import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { DatabaseModule } from '@/database/database.module';
import knowledgeGraphConfig from '@/knowledge-graph/config/knowledge-graph.config';
import { SearchQuotaDrizzleRepository } from '@/knowledge-graph/infrastructure/persistence/drizzle/repositories/search-quota.repository';
import { RequestQuotaPersistenceModule } from '@/knowledge-graph/infrastructure/persistence/drizzle/request-quota-persistence.module';
import { SearchQuotaRepository } from '@/knowledge-graph/infrastructure/persistence/search-quota.repository';

@Module({
  imports: [
    ConfigModule.forFeature(knowledgeGraphConfig),
    DatabaseModule,
    RequestQuotaPersistenceModule,
  ],
  providers: [
    {
      provide: SearchQuotaRepository,
      useClass: SearchQuotaDrizzleRepository,
    },
  ],
  exports: [SearchQuotaRepository],
})
export class SearchQuotaPersistenceModule {}
