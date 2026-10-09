import { Injectable } from '@nestjs/common';

import { SemanticRecoveryRepository } from '@/knowledge-graph/infrastructure/persistence/semantic-recovery.repository';
import { OutboxSemanticRecovery } from '@/outbox/outbox-semantic-recovery';

@Injectable()
export class OutboxSemanticRecoveryAdapter extends SemanticRecoveryRepository {
  releaseDeliveryFailure(
    ...args: Parameters<SemanticRecoveryRepository['releaseDeliveryFailure']>
  ) {
    return this.recovery.releaseDeliveryFailure(...args);
  }
  constructor(private readonly recovery: OutboxSemanticRecovery) {
    super();
  }
  discoverMissing(
    ...args: Parameters<SemanticRecoveryRepository['discoverMissing']>
  ) {
    return this.recovery.discoverMissing(...args);
  }
  claimGapBatch(
    ...args: Parameters<SemanticRecoveryRepository['claimGapBatch']>
  ) {
    return this.recovery.claimGapBatch(...args);
  }
  stats(...args: Parameters<SemanticRecoveryRepository['stats']>) {
    return this.recovery.stats(...args);
  }
}
