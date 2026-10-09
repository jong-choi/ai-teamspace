import type {
  CuratedEdge,
  CuratedNode,
} from '@/knowledge-graph/domain/curated-graph';

export type CuratedGraphListQuery = {
  q?: string | null;
  after?: { title: string; id: string } | null;
  limit: number;
};

export abstract class CuratedGraphQueryRepository {
  abstract listNodes(
    organizationId: string,
    query: CuratedGraphListQuery,
  ): Promise<CuratedNode[]>;
  abstract countNodes(
    organizationId: string,
    q?: string | null,
  ): Promise<number>;
  abstract nodeById(
    organizationId: string,
    nodeId: string,
  ): Promise<CuratedNode | null>;
  abstract countConnectedEdges(
    organizationId: string,
    nodeId: string,
  ): Promise<number>;
  abstract listConnectedEdges(
    organizationId: string,
    nodeId: string,
    limit: number,
  ): Promise<CuratedEdge[]>;
  abstract listEdges(
    organizationId: string,
    query: { afterId?: string | null; limit: number },
  ): Promise<CuratedEdge[]>;
  abstract countEdges(organizationId: string): Promise<number>;
  abstract edgeById(
    organizationId: string,
    edgeId: string,
  ): Promise<CuratedEdge | null>;
}
