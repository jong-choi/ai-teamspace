import type { KnowledgeGraphAggregateKind } from '@/outbox/outbox-aggregate-change.publisher';

export type ProjectionFreshnessSource = {
  kind: KnowledgeGraphAggregateKind;
  id: string;
};

export type ProjectionFreshness = ProjectionFreshnessSource & {
  desiredSeq: number | null;
  appliedSeq: number | null;
  deleted: boolean;
  projectionStatus:
    'pending' | 'applying' | 'applied' | 'retry_scheduled' | 'failed' | null;
  sourceUpdatedAt: Date | null;
  fresh: boolean;
  pending: boolean;
};

export abstract class ProjectionFreshnessRepository {
  abstract freshnessBatch(
    organizationId: string,
    sources: readonly ProjectionFreshnessSource[],
  ): Promise<ProjectionFreshness[]>;
}
