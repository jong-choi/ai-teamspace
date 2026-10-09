import type {
  SemanticActivation,
  SemanticLease,
  SemanticReleaseOutcome,
  SemanticSatisfaction,
  SemanticSourceScope,
} from '@/outbox/domain/semantic-source';
import type { OutboxSemanticSourceState } from '@/outbox/outbox-semantic-source-state';

export abstract class SemanticSourceStateRepository {
  abstract current(
    scope: SemanticSourceScope,
  ): ReturnType<OutboxSemanticSourceState['current']>;
  abstract observeCommitted(
    scope: SemanticSourceScope,
    sourceVersion: number,
  ): ReturnType<OutboxSemanticSourceState['observeCommitted']>;
  abstract acquireLease(
    scope: SemanticSourceScope,
    fingerprint: string,
  ): ReturnType<OutboxSemanticSourceState['acquireLease']>;
  abstract heartbeat(
    scope: SemanticSourceScope,
    lease: SemanticLease,
  ): Promise<boolean>;
  abstract release(
    scope: SemanticSourceScope,
    lease: SemanticLease,
    outcome: SemanticReleaseOutcome,
  ): Promise<boolean>;
  abstract activate(
    scope: SemanticSourceScope,
    lease: SemanticLease,
    result: SemanticActivation,
  ): ReturnType<OutboxSemanticSourceState['activate']>;
  abstract satisfyWithoutReindex(
    scope: SemanticSourceScope,
    lease: SemanticLease,
    result: SemanticSatisfaction,
  ): ReturnType<OutboxSemanticSourceState['satisfyWithoutReindex']>;
  abstract markRemoved(
    scope: SemanticSourceScope,
    lease: SemanticLease,
  ): ReturnType<OutboxSemanticSourceState['markRemoved']>;
  abstract clearGc(
    scope: SemanticSourceScope,
    expectedActiveGenerationId: string | null,
  ): Promise<boolean>;
}
