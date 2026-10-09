import { outboxAggregateVersionSelectSchema } from '@/outbox/infrastructure/persistence/drizzle/schema/outbox-aggregate-version.zod';
import { OutboxSemanticSourceStateSelectSchema } from '@/outbox/infrastructure/persistence/drizzle/schema/outbox-semantic-source-state.zod';

import { z } from 'zod';

export const SemanticSourceScopeSchema =
  OutboxSemanticSourceStateSelectSchema.pick({
    organizationId: true,
    aggregateKind: true,
    aggregateId: true,
  });

export const SemanticSourceCurrentSchema = z.object({
  version: outboxAggregateVersionSelectSchema.pick({
    desiredSeq: true,
    deleted: true,
    updatedAt: true,
  }),
  state: OutboxSemanticSourceStateSelectSchema.nullable(),
  dbNow: z.date(),
});
export const SemanticRecoveryCandidateSchema =
  SemanticSourceCurrentSchema.extend({
    scope: SemanticSourceScopeSchema,
    state: OutboxSemanticSourceStateSelectSchema,
  });
export const SemanticLeaseSchema = OutboxSemanticSourceStateSelectSchema.pick({
  leaseToken: true,
  fenceToken: true,
  attemptSeq: true,
  attemptManualSeq: true,
  attemptFingerprint: true,
}).extend({
  leaseToken: OutboxSemanticSourceStateSelectSchema.shape.leaseToken.unwrap(),
  attemptFingerprint:
    OutboxSemanticSourceStateSelectSchema.shape.attemptFingerprint.unwrap(),
});
export const SemanticActivationSchema =
  OutboxSemanticSourceStateSelectSchema.pick({
    activeGenerationId: true,
    indexedSignature: true,
    indexedSourceUpdatedAt: true,
    indexedFingerprint: true,
  }).extend({
    activeGenerationId:
      OutboxSemanticSourceStateSelectSchema.shape.activeGenerationId.unwrap(),
    indexedSignature:
      OutboxSemanticSourceStateSelectSchema.shape.indexedSignature.unwrap(),
    indexedSourceUpdatedAt:
      OutboxSemanticSourceStateSelectSchema.shape.indexedSourceUpdatedAt.unwrap(),
    indexedFingerprint:
      OutboxSemanticSourceStateSelectSchema.shape.indexedFingerprint.unwrap(),
  });
export const SemanticReleaseOutcomeSchema =
  OutboxSemanticSourceStateSelectSchema.pick({
    runStatus: true,
    lastErrorCode: true,
  }).extend({
    runStatus: OutboxSemanticSourceStateSelectSchema.shape.runStatus.exclude([
      'running',
    ]),
  });

export type SemanticSourceScope = z.infer<typeof SemanticSourceScopeSchema>;
export type SemanticSourceCurrent = z.infer<typeof SemanticSourceCurrentSchema>;
export type SemanticRecoveryCandidate = z.infer<
  typeof SemanticRecoveryCandidateSchema
>;
export type SemanticLease = z.infer<typeof SemanticLeaseSchema>;
export type SemanticActivation = z.infer<typeof SemanticActivationSchema>;
export type SemanticReleaseOutcome = z.infer<
  typeof SemanticReleaseOutcomeSchema
>;
export type SemanticSatisfaction = Pick<
  SemanticActivation,
  'indexedSignature' | 'indexedSourceUpdatedAt' | 'indexedFingerprint'
>;
