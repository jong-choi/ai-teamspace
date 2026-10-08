import { Module } from '@nestjs/common';

import { DatabaseModule } from '@/database/database.module';
import { CuratedGraphRepository } from '@/knowledge-graph/infrastructure/persistence/curated-graph.repository';
import { CuratedGraphDrizzleRepository } from '@/knowledge-graph/infrastructure/persistence/drizzle/repositories/curated-graph.repository';
import { OutboxInfrastructureModule } from '@/outbox/outbox.module';

@Module({
  imports: [DatabaseModule, OutboxInfrastructureModule],
  providers: [
    {
      provide: CuratedGraphRepository,
      useClass: CuratedGraphDrizzleRepository,
    },
  ],
  exports: [CuratedGraphRepository],
})
export class CuratedGraphPersistenceModule {}
