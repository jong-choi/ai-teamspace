import type { ReconciliationScope } from '@/knowledge-graph/domain/reconciliation-scope';
import type { ProjectionStateRepository } from '@/knowledge-graph/infrastructure/persistence/projection-state.repository';
import type { TeamspaceSourceProvider } from '@/knowledge-graph/infrastructure/source/teamspace-source.provider';

export abstract class ProjectionDeliveryRepository {
  abstract recordOrganizationTombstones(
    scope: ReconciliationScope,
    sources: NonNullable<
      Awaited<ReturnType<ProjectionStateRepository['current']>>
    >[],
  ): Promise<number | null>;
  abstract requeuePendingBatch(limit: number): Promise<number>;
  abstract recordObservedSnapshot(
    source: NonNullable<
      Awaited<ReturnType<ProjectionStateRepository['current']>>
    >,
    snapshot: Awaited<
      ReturnType<TeamspaceSourceProvider['observeMembershipSnapshot']>
    >,
    scope: ReconciliationScope,
  ): Promise<'recorded' | 'unchanged' | 'lease_lost'>;
  abstract recordObservedDeletion(
    source: NonNullable<
      Awaited<ReturnType<ProjectionStateRepository['current']>>
    >,
    deleted: boolean,
  ): Promise<void>;
  abstract initializeBatch(
    kind: Parameters<TeamspaceSourceProvider['listIds']>[0],
    organizationId: string,
    sources: Awaited<ReturnType<TeamspaceSourceProvider['listIds']>>,
    scope?: ReconciliationScope,
  ): Promise<boolean>;
}
