import {
  computeSemanticGaps,
  isSemanticTerminal,
} from '@/knowledge-graph/domain/semantic-source-gap';
import type { SemanticSourceCurrent } from '@/outbox/domain/semantic-source';

export function semanticRecoveryAction(
  current: SemanticSourceCurrent,
  fingerprint: string,
  applyCooldown = false,
) {
  const state = current.state;
  if (!state) return 'none';
  const now = current.dbNow.getTime();
  if (
    applyCooldown &&
    state.lastRequeuedAt &&
    state.indexedManualSeq >= state.manualRequestSeq &&
    state.observedSeq >= current.version.desiredSeq
  ) {
    const cooldown = Math.min(
      300_000 * 2 ** Math.min(state.requeueCount, 4),
      3_600_000,
    );
    if (state.lastRequeuedAt.getTime() + cooldown >= now) return 'none';
  }
  if (current.version.deleted)
    return state.indexedSeq < current.version.desiredSeq || state.gcRequired
      ? 'remove'
      : 'none';
  if (isSemanticTerminal(current, fingerprint)) return 'none';
  const gaps = computeSemanticGaps(current, fingerprint);
  if (gaps.manual) return 'manual';
  if (gaps.desired || gaps.fingerprint) return 'auto';
  if (
    state.runStatus === 'running' &&
    state.leaseExpiresAt &&
    state.leaseExpiresAt.getTime() < now - 60_000
  )
    return 'auto';
  if (
    state.gcRequired &&
    state.leaseToken === null &&
    (state.lastIndexedAt ?? state.updatedAt).getTime() < now - 600_000
  )
    return 'gc';
  return 'none';
}
