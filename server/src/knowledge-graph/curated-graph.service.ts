import { Injectable } from '@nestjs/common';

import type {
  CreateCuratedEdgeInput,
  CreateCuratedNodeInput,
  UpdateCuratedEdgeInput,
  UpdateCuratedNodeInput,
} from '@/knowledge-graph/dto/curated-graph.dto';
import { CuratedGraphRepository } from '@/knowledge-graph/infrastructure/persistence/curated-graph.repository';

@Injectable()
export class CuratedGraphService {
  constructor(private readonly repository: CuratedGraphRepository) {}

  createNode(
    organizationId: string,
    actorUserId: string,
    input: CreateCuratedNodeInput,
  ) {
    return this.repository.createNode(organizationId, actorUserId, input);
  }

  updateNode(
    organizationId: string,
    nodeId: string,
    actorUserId: string,
    expectedRevision: number,
    input: UpdateCuratedNodeInput,
  ) {
    return this.repository.updateNode(
      organizationId,
      nodeId,
      actorUserId,
      expectedRevision,
      input,
    );
  }

  deleteNode(
    organizationId: string,
    nodeId: string,
    actorUserId: string,
    expectedRevision: number,
  ) {
    return this.repository.deleteNode(
      organizationId,
      nodeId,
      actorUserId,
      expectedRevision,
    );
  }

  createEdge(
    organizationId: string,
    actorUserId: string,
    input: CreateCuratedEdgeInput,
  ) {
    return this.repository.createEdge(organizationId, actorUserId, input);
  }

  updateEdge(
    organizationId: string,
    edgeId: string,
    actorUserId: string,
    expectedRevision: number,
    input: UpdateCuratedEdgeInput,
  ) {
    return this.repository.updateEdge(
      organizationId,
      edgeId,
      actorUserId,
      expectedRevision,
      input,
    );
  }

  deleteEdge(
    organizationId: string,
    edgeId: string,
    actorUserId: string,
    expectedRevision: number,
  ) {
    return this.repository.deleteEdge(
      organizationId,
      edgeId,
      actorUserId,
      expectedRevision,
    );
  }
}
