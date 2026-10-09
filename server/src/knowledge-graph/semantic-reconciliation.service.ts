import { Injectable, Logger } from '@nestjs/common';

import { semanticPipelineFingerprint } from '@/knowledge-graph/domain/semantic-pipeline';
import { semanticRecoveryAction } from '@/knowledge-graph/domain/semantic-recovery-action';
import { SEMANTIC_QUIET_MS } from '@/knowledge-graph/domain/semantic-timing';
import { SemanticManualRequestRepository } from '@/knowledge-graph/infrastructure/persistence/semantic-manual-request.repository';
import { SemanticRecoveryRepository } from '@/knowledge-graph/infrastructure/persistence/semantic-recovery.repository';
import { SemanticJobQueueProvider } from '@/knowledge-graph/infrastructure/queue/semantic-job-queue.provider';

@Injectable()
export class SemanticReconciliationService {
  private readonly logger = new Logger(SemanticReconciliationService.name);
  constructor(
    private readonly recovery: SemanticRecoveryRepository,
    private readonly queue: SemanticJobQueueProvider,
    private readonly manual: SemanticManualRequestRepository,
  ) {}
  async runOnce() {
    await this.recovery.discoverMissing(100);
    const candidates = await this.recovery.claimGapBatch(
      25,
      semanticPipelineFingerprint,
    );
    let handled = 0;
    for (const current of candidates) {
      try {
        const action = semanticRecoveryAction(
          current,
          semanticPipelineFingerprint,
        );
        if (action === 'none') continue;
        if (action === 'remove')
          await this.queue.remove(current.scope, current.version.desiredSeq);
        else if (action === 'manual') {
          if (!current.state.manualRequestId)
            throw new Error('SEMANTIC_MANUAL_STATE_INVALID');
          await this.queue.manual(current.scope, current.state.manualRequestId);
          await this.manual.markDelivered(
            current.scope,
            current.state.manualRequestSeq,
          );
        } else {
          const delayMs =
            action === 'gc'
              ? 0
              : current.state.observedAt
                ? Math.max(
                    0,
                    current.state.observedAt.getTime() +
                      SEMANTIC_QUIET_MS -
                      current.dbNow.getTime(),
                  )
                : SEMANTIC_QUIET_MS;
          await this.queue.auto(current.scope, delayMs);
        }
        handled++;
      } catch {
        try {
          await this.recovery.releaseDeliveryFailure(current);
        } catch {
          this.logger.warn({ code: 'SEMANTIC_RECOVERY_CLAIM_RELEASE_FAILED' });
        }
        this.logger.warn({ code: 'SEMANTIC_RECOVERY_DELIVERY_FAILED' });
      }
    }
    return handled;
  }
  stats() {
    return this.recovery.stats(semanticPipelineFingerprint);
  }
}
