import type {
  CuratedEdge,
  CuratedNode,
} from '@/knowledge-graph/domain/curated-graph';

export abstract class CuratedProjectionSourceRepository {
  abstract node(
    organizationId: string,
    sourceId: string,
  ): Promise<CuratedNode | null>;
  abstract edge(
    organizationId: string,
    sourceId: string,
  ): Promise<CuratedEdge | null>;
  abstract listNodeIds(
    organizationId: string,
    afterId: string | null,
    limit: number,
  ): Promise<Pick<CuratedNode, 'id' | 'deletedAt'>[]>;
  abstract listEdgeIds(
    organizationId: string,
    afterId: string | null,
    limit: number,
  ): Promise<Pick<CuratedEdge, 'id' | 'deletedAt'>[]>;
}
