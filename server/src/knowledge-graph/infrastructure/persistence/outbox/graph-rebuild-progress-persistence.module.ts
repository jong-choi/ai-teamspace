import { Module } from '@nestjs/common';

import { GraphRebuildProgressRepository } from '@/knowledge-graph/infrastructure/persistence/graph-rebuild-progress.repository';
import { OutboxGraphRebuildProgressAdapter } from '@/knowledge-graph/infrastructure/persistence/outbox/outbox-graph-rebuild-progress.adapter';
import { OutboxInfrastructureModule } from '@/outbox/outbox.module';

@Module({
  imports: [OutboxInfrastructureModule],
  providers: [
    {
      provide: GraphRebuildProgressRepository,
      useClass: OutboxGraphRebuildProgressAdapter,
    },
  ],
  exports: [GraphRebuildProgressRepository],
})
export class GraphRebuildProgressPersistenceModule {}
