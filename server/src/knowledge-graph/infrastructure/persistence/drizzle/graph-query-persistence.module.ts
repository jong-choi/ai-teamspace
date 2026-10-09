import { Module } from '@nestjs/common';

import { DatabaseModule } from '@/database/database.module';
import { CuratedGraphQueryRepository } from '@/knowledge-graph/infrastructure/persistence/curated-graph-query.repository';
import { CuratedGraphQueryDrizzleRepository } from '@/knowledge-graph/infrastructure/persistence/drizzle/repositories/curated-graph-query.repository';

@Module({
  imports: [DatabaseModule],
  providers: [
    {
      provide: CuratedGraphQueryRepository,
      useClass: CuratedGraphQueryDrizzleRepository,
    },
  ],
  exports: [CuratedGraphQueryRepository],
})
export class GraphQueryPersistenceModule {}
