import {
  computeSemanticGaps,
  isSemanticTerminal,
} from '@/knowledge-graph/domain/semantic-source-gap';
import { semanticEligibleAt } from '@/knowledge-graph/domain/semantic-timing';
import type { SemanticSourceCurrent } from '@/outbox/domain/semantic-source';

import { z } from 'zod';

export const SemanticIndexStatusSchema = z.enum([
  'accepted',
  'queued',
  'running',
  'waiting',
  'stale',
  'not_indexed',
  'up_to_date',
  'failed',
]);

export function deriveSemanticIndexStatus(
  current: SemanticSourceCurrent | null,
  ownerUpdatedAt: Date | null,
  fingerprint: string,
) {
  if (!current || current.version.deleted || !ownerUpdatedAt) return null;
  const state = current.state;
  const gaps = computeSemanticGaps(current, fingerprint);
  const eligibleAt = semanticEligibleAt(current, ownerUpdatedAt);
  const remainingMs =
    eligibleAt === null
      ? null
      : Math.max(0, eligibleAt.getTime() - current.dbNow.getTime());
  let status: z.infer<typeof SemanticIndexStatusSchema>;
  if (state?.leaseExpiresAt && state.leaseExpiresAt > current.dbNow)
    status = 'running';
  else if (isSemanticTerminal(current, fingerprint) && !gaps.none)
    status = 'failed';
  else if (
    gaps.manual &&
    (state?.manualDeliveredSeq ?? 0) < (state?.manualRequestSeq ?? 0)
  )
    status = 'accepted';
  else if (gaps.manual || (state?.runStatus === 'retry_waiting' && !gaps.none))
    status = 'queued';
  else if (
    (gaps.desired || gaps.fingerprint) &&
    (remainingMs === null || remainingMs > 0)
  )
    status = 'waiting';
  else if (gaps.desired || gaps.fingerprint)
    status = state?.activeGenerationId ? 'stale' : 'not_indexed';
  else status = state?.activeGenerationId ? 'up_to_date' : 'not_indexed';
  return {
    status,
    sourceUpdatedAt: ownerUpdatedAt,
    indexedSourceUpdatedAt: state?.indexedSourceUpdatedAt ?? null,
    requestId: gaps.manual ? (state?.manualRequestId ?? null) : null,
    requestedAt: gaps.manual ? (state?.manualRequestedAt ?? null) : null,
    completedAt: state?.lastIndexedAt ?? null,
    errorCode: status === 'failed' ? (state?.lastErrorCode ?? null) : null,
    quietRemainingMs: status === 'waiting' ? remainingMs : null,
  };
}
