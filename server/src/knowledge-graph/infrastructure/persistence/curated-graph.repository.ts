import type {
  CuratedEdge,
  CuratedNode,
} from '@/knowledge-graph/domain/curated-graph';
import type {
  CreateCuratedEdgeInput,
  CreateCuratedNodeInput,
  UpdateCuratedEdgeInput,
  UpdateCuratedNodeInput,
} from '@/knowledge-graph/dto/curated-graph.dto';

export abstract class CuratedGraphRepository {
  abstract createNode(
    organizationId: string,
    actorUserId: string,
    input: CreateCuratedNodeInput,
  ): Promise<CuratedNode>;

  abstract updateNode(
    organizationId: string,
    nodeId: string,
    actorUserId: string,
    expectedRevision: number,
    input: UpdateCuratedNodeInput,
  ): Promise<CuratedNode | null>;

  abstract deleteNode(
    organizationId: string,
    nodeId: string,
    actorUserId: string,
    expectedRevision: number,
  ): Promise<CuratedNode | null>;

  abstract createEdge(
    organizationId: string,
    actorUserId: string,
    input: CreateCuratedEdgeInput,
  ): Promise<CuratedEdge>;

  abstract updateEdge(
    organizationId: string,
    edgeId: string,
    actorUserId: string,
    expectedRevision: number,
    input: UpdateCuratedEdgeInput,
  ): Promise<CuratedEdge | null>;

  abstract deleteEdge(
    organizationId: string,
    edgeId: string,
    actorUserId: string,
    expectedRevision: number,
  ): Promise<CuratedEdge | null>;
}
