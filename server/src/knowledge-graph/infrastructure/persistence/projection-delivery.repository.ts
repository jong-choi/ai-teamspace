import type { ProjectionStateRepository } from '@/knowledge-graph/infrastructure/persistence/projection-state.repository';
import type { WorkosSourceProvider } from '@/knowledge-graph/infrastructure/source/workos-source.provider';

export abstract class ProjectionDeliveryRepository {
  abstract initializeBatch(
    kind: Parameters<WorkosSourceProvider['listIds']>[0],
    organizationId: string,
    sources: Awaited<ReturnType<WorkosSourceProvider['listIds']>>,
  ): Promise<void>;
  abstract requeue(
    source: NonNullable<
      Awaited<ReturnType<ProjectionStateRepository['current']>>
    >,
  ): Promise<void>;
}
