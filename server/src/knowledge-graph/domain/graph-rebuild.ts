import { GraphRebuildRequestSelectSchema } from '@/knowledge-graph/infrastructure/persistence/drizzle/schema/graph-rebuild-request.zod';
import { OutboxAggregateVersionSchema } from '@/outbox/outbox-aggregate-event.schema';

import { z } from 'zod';

export const GraphRebuildModeSchema =
  GraphRebuildRequestSelectSchema.shape.mode;
export const GraphRebuildStatusSchema =
  GraphRebuildRequestSelectSchema.shape.status;
export const GraphRebuildPhaseSchema =
  GraphRebuildRequestSelectSchema.shape.phase.unwrap();
export const GraphRebuildErrorCodeSchema =
  GraphRebuildRequestSelectSchema.shape.lastErrorCode.unwrap();
export const GraphRebuildKindSchema =
  OutboxAggregateVersionSchema.shape.aggregateKind;

export const GraphRebuildRequestSchema = GraphRebuildRequestSelectSchema.extend(
  {
    cursorKind: GraphRebuildKindSchema.nullable(),
  },
).strict();

export type GraphRebuildRequest = z.infer<typeof GraphRebuildRequestSchema>;
export type GraphRebuildMode = z.infer<typeof GraphRebuildModeSchema>;
export type GraphRebuildStatus = z.infer<typeof GraphRebuildStatusSchema>;
export type GraphRebuildPhase = z.infer<typeof GraphRebuildPhaseSchema>;
export type GraphRebuildErrorCode = z.infer<typeof GraphRebuildErrorCodeSchema>;
export type GraphRebuildKind = z.infer<typeof GraphRebuildKindSchema>;

export const GraphRebuildPositionSchema = z
  .object({
    phase: GraphRebuildPhaseSchema,
    kind: GraphRebuildKindSchema.nullable(),
    afterId: z.string().min(1).max(512).nullable(),
  })
  .strict();

export type GraphRebuildPosition = z.infer<typeof GraphRebuildPositionSchema>;

export const RebuildAcceptanceSchema = GraphRebuildRequestSchema.pick({
  id: true,
  mode: true,
  acceptedAt: true,
})
  .extend({
    status: z.literal('accepted'),
    coalesced: z.boolean(),
  })
  .strict();

export type RebuildAcceptance = z.infer<typeof RebuildAcceptanceSchema>;

export const RebuildClaimSchema = GraphRebuildRequestSchema.pick({
  id: true,
  organizationId: true,
  requestedByUserId: true,
  mode: true,
  status: true,
  phase: true,
  cursorKind: true,
  cursorAfterId: true,
  leaseToken: true,
  leaseExpiresAt: true,
  fenceToken: true,
  catchUpStartedAt: true,
})
  .extend({
    leaseToken: z.uuid(),
    leaseExpiresAt: z.date(),
  })
  .strict();

export type RebuildClaim = z.infer<typeof RebuildClaimSchema>;

export const RebuildOutcomeSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('succeeded') }).strict(),
  z.object({ status: z.literal('cancelled') }).strict(),
  z
    .object({
      status: z.literal('failed'),
      errorCode: GraphRebuildErrorCodeSchema,
      failedSources: z.number().int().nonnegative().nullable().default(null),
    })
    .strict(),
]);

export type RebuildOutcome = z.infer<typeof RebuildOutcomeSchema>;

export function isGraphRebuildTerminal(status: GraphRebuildStatus): boolean {
  return (
    status === 'succeeded' || status === 'failed' || status === 'cancelled'
  );
}

export function canCancelGraphRebuild(status: GraphRebuildStatus): boolean {
  return (
    status === 'accepted' || status === 'running' || status === 'catching_up'
  );
}

export function canTransitionGraphRebuild(
  from: GraphRebuildStatus,
  to: GraphRebuildStatus,
): boolean {
  if (isGraphRebuildTerminal(from)) return false;
  if (from === to) return true;
  switch (from) {
    case 'accepted':
      return to === 'running' || to === 'cancel_requested' || to === 'failed';
    case 'running':
      return (
        to === 'catching_up' || to === 'cancel_requested' || to === 'failed'
      );
    case 'catching_up':
      return to === 'succeeded' || to === 'cancel_requested' || to === 'failed';
    case 'cancel_requested':
      return to === 'cancelled' || to === 'failed';
    default:
      return false;
  }
}
