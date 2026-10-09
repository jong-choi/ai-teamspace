import type { SemanticSourceCurrent } from '@/outbox/domain/semantic-source';

export function computeSemanticGaps(
  current: SemanticSourceCurrent,
  fingerprint: string,
) {
  const live = !current.version.deleted;
  const desired =
    live && (current.state?.indexedSeq ?? 0) < current.version.desiredSeq;
  const manual =
    live &&
    (current.state?.indexedManualSeq ?? 0) <
      (current.state?.manualRequestSeq ?? 0);
  const changedFingerprint =
    live &&
    (current.state?.indexedSeq ?? 0) > 0 &&
    current.state?.indexedFingerprint !== fingerprint;
  return {
    desired,
    manual,
    fingerprint: changedFingerprint,
    none: !desired && !manual && !changedFingerprint,
  };
}

export function isSemanticTerminal(
  current: SemanticSourceCurrent,
  fingerprint: string,
) {
  const state = current.state;
  return (
    !current.version.deleted &&
    state !== null &&
    (state.runStatus === 'failed' || state.runStatus === 'validation_failed') &&
    state.attemptSeq === current.version.desiredSeq &&
    state.attemptManualSeq === state.manualRequestSeq &&
    state.attemptFingerprint === fingerprint
  );
}
