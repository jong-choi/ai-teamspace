import type {
  GraphRebuildKind,
  GraphRebuildMode,
  GraphRebuildPosition,
  GraphRebuildRequest,
  RebuildAcceptance,
  RebuildClaim,
  RebuildOutcome,
} from '@/knowledge-graph/domain/graph-rebuild';

export type RebuildRequestResult =
  | { outcome: 'accepted'; acceptance: RebuildAcceptance }
  | { outcome: 'forbidden' };

export type RebuildCancelResult =
  | { outcome: 'cancelled'; request: GraphRebuildRequest }
  | { outcome: 'forbidden' }
  | { outcome: 'not_found' }
  | { outcome: 'not_cancellable' };

export abstract class GraphRebuildRequestRepository {
  abstract request(
    organizationId: string,
    actorUserId: string,
    mode: GraphRebuildMode,
  ): Promise<RebuildRequestResult>;

  abstract cancel(
    organizationId: string,
    actorUserId: string,
    requestId: string,
  ): Promise<RebuildCancelResult>;

  abstract get(
    organizationId: string,
    requestId: string,
  ): Promise<GraphRebuildRequest | null>;

  abstract listRecent(
    organizationId: string,
    limit: number,
  ): Promise<GraphRebuildRequest[]>;

  abstract latest(organizationId: string): Promise<GraphRebuildRequest | null>;

  abstract active(organizationId: string): Promise<GraphRebuildRequest | null>;
}

export abstract class GraphRebuildWorkerRepository {
  abstract claim(
    requestId: string,
  ): Promise<RebuildClaim | 'missing' | 'busy' | 'terminal'>;

  abstract commitProjectionPage(
    claim: RebuildClaim,
    kind: GraphRebuildKind,
    ids: readonly string[],
  ): Promise<boolean>;

  abstract commitSemanticPage(
    claim: RebuildClaim,
    ids: readonly string[],
  ): Promise<boolean>;

  abstract advance(
    claim: RebuildClaim,
    next: GraphRebuildPosition,
  ): Promise<RebuildClaim | null>;

  abstract heartbeat(claim: RebuildClaim): Promise<RebuildClaim | null>;

  abstract release(claim: RebuildClaim): Promise<boolean>;

  abstract startCatchUp(claim: RebuildClaim): Promise<RebuildClaim | null>;

  abstract finish(
    claim: RebuildClaim,
    outcome: RebuildOutcome,
  ): Promise<boolean>;

  abstract listRedeliverable(limit: number): Promise<string[]>;
}
