import { Module } from '@nestjs/common';

import { GraphCompletenessService } from '@/knowledge-graph/graph-completeness.service';
import { GraphRebuildPersistenceModule } from '@/knowledge-graph/infrastructure/persistence/drizzle/graph-rebuild-persistence.module';

@Module({
  imports: [GraphRebuildPersistenceModule],
  providers: [GraphCompletenessService],
  exports: [GraphCompletenessService],
})
export class GraphCompletenessModule {}
