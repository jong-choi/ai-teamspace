import { Module } from '@nestjs/common';

import { SemanticStatePersistenceModule } from '@/knowledge-graph/infrastructure/persistence/outbox/semantic-state-persistence.module';
import { SemanticRefreshService } from '@/knowledge-graph/semantic-refresh.service';

@Module({
  imports: [SemanticStatePersistenceModule],
  providers: [SemanticRefreshService],
  exports: [SemanticRefreshService],
})
export class SemanticRefreshModule {}
