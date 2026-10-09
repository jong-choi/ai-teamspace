import { Module } from '@nestjs/common';

import { OutboxSemanticManualRequestAdapter } from '@/knowledge-graph/infrastructure/persistence/outbox/outbox-semantic-manual-request.adapter';
import { OutboxSemanticRecoveryAdapter } from '@/knowledge-graph/infrastructure/persistence/outbox/outbox-semantic-recovery.adapter';
import { OutboxSemanticSourceStateAdapter } from '@/knowledge-graph/infrastructure/persistence/outbox/outbox-semantic-source-state.adapter';
import { SemanticManualRequestRepository } from '@/knowledge-graph/infrastructure/persistence/semantic-manual-request.repository';
import { SemanticRecoveryRepository } from '@/knowledge-graph/infrastructure/persistence/semantic-recovery.repository';
import { SemanticSourceStateRepository } from '@/knowledge-graph/infrastructure/persistence/semantic-source-state.repository';
import { OutboxInfrastructureModule } from '@/outbox/outbox.module';

@Module({
  imports: [OutboxInfrastructureModule],
  providers: [
    {
      provide: SemanticRecoveryRepository,
      useClass: OutboxSemanticRecoveryAdapter,
    },
    {
      provide: SemanticSourceStateRepository,
      useClass: OutboxSemanticSourceStateAdapter,
    },
    {
      provide: SemanticManualRequestRepository,
      useClass: OutboxSemanticManualRequestAdapter,
    },
  ],
  exports: [
    SemanticSourceStateRepository,
    SemanticManualRequestRepository,
    SemanticRecoveryRepository,
  ],
})
export class SemanticStatePersistenceModule {}
