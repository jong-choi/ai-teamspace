import type { ReconciliationScope } from '@/knowledge-graph/domain/reconciliation-scope';
import type { ProjectionStateRepository } from '@/knowledge-graph/infrastructure/persistence/projection-state.repository';
import type { WorkosSourceProvider } from '@/knowledge-graph/infrastructure/source/workos-source.provider';

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
      ReturnType<WorkosSourceProvider['observeMembershipSnapshot']>
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
    kind: Parameters<WorkosSourceProvider['listIds']>[0],
    organizationId: string,
    sources: Awaited<ReturnType<WorkosSourceProvider['listIds']>>,
    scope?: ReconciliationScope,
  ): Promise<boolean>;
}
