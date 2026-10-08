import { Module } from '@nestjs/common';

import { CuratedGraphService } from '@/knowledge-graph/curated-graph.service';
import { CuratedGraphPersistenceModule } from '@/knowledge-graph/infrastructure/persistence/drizzle/curated-graph-persistence.module';

@Module({
  imports: [CuratedGraphPersistenceModule],
  providers: [CuratedGraphService],
  exports: [CuratedGraphService],
})
export class CuratedGraphModule {}
