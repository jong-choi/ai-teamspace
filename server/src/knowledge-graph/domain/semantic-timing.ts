import type { SemanticSourceCurrent } from '@/outbox/domain/semantic-source';

export const SEMANTIC_QUIET_MS = 30_000;

export function semanticEligibleAt(
  current: SemanticSourceCurrent,
  ownerUpdatedAt: Date,
) {
  if (
    !current.state?.observedAt ||
    current.state.observedSeq !== current.version.desiredSeq
  )
    return null;
  return new Date(
    Math.max(ownerUpdatedAt.getTime(), current.state.observedAt.getTime()) +
      SEMANTIC_QUIET_MS,
  );
}
