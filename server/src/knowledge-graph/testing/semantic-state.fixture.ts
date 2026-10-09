import { SemanticSourceCurrentSchema } from '@/outbox/domain/semantic-source';
import { OutboxSemanticSourceStateSelectSchema } from '@/outbox/infrastructure/persistence/drizzle/schema/outbox-semantic-source-state.zod';

import type { z } from 'zod';

export function semanticStateFixture(
  overrides: Partial<
    z.infer<typeof OutboxSemanticSourceStateSelectSchema>
  > = {},
) {
  return OutboxSemanticSourceStateSelectSchema.parse({
    organizationId: 'p7-unit-org',
    aggregateKind: 'wiki_document',
    aggregateId: '10000000-0000-4000-8000-000000000001',
    observedSeq: 1,
    observedAt: new Date(0),
    manualRequestSeq: 0,
    manualRequestId: null,
    manualRequestedAt: null,
    manualRequestedByUserId: null,
    manualTargetSeq: 0,
    manualDeliveredSeq: 0,
    indexedSeq: 0,
    indexedManualSeq: 0,
    indexedSignature: null,
    indexedSourceUpdatedAt: null,
    indexedFingerprint: null,
    activeGenerationId: null,
    lastIndexedAt: null,
    runStatus: 'idle',
    attemptSeq: 0,
    attemptManualSeq: 0,
    attemptFingerprint: null,
    leaseToken: null,
    leaseExpiresAt: null,
    fenceToken: 0,
    gcRequired: false,
    lastErrorCode: null,
    retryCount: 0,
    requeueCount: 0,
    lastRequeuedAt: null,
    updatedAt: new Date(0),
    ...overrides,
  });
}

export function semanticCurrentFixture(
  overrides: Partial<z.infer<typeof SemanticSourceCurrentSchema>> = {},
) {
  return SemanticSourceCurrentSchema.parse({
    version: { desiredSeq: 1, deleted: false, updatedAt: new Date(0) },
    state: semanticStateFixture(),
    dbNow: new Date('2026-10-09T00:00:00Z'),
    ...overrides,
  });
}
