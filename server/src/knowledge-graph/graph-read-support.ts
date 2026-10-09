import {
  decodeGraphEdgeId,
  decodeGraphNodeId,
  encodeGraphEdgeId,
  encodeGraphNodeId,
  type GraphEdgeIdentity,
  type GraphNodeIdentity,
} from '@/knowledge-graph/domain/graph-identity';
import {
  KnowledgeGraphCursorScopeMismatchError,
  KnowledgeGraphEdgeNotFoundError,
  KnowledgeGraphNodeNotFoundError,
} from '@/knowledge-graph/domain/graph-read.error';
import {
  GraphEdgeRelationSchema,
  GraphNodeKindSchema,
} from '@/knowledge-graph/domain/graph-read-contract';
import { graphSourceKey } from '@/knowledge-graph/domain/graph-source-key';

import { z } from 'zod';

export type GraphNodeKind = z.infer<typeof GraphNodeKindSchema>;
export type GraphEdgeRelation = z.infer<typeof GraphEdgeRelationSchema>;

export const GRAPH_NODE_KIND_ORDER: readonly GraphNodeKind[] = [
  'wiki_document',
  'project',
  'ticket',
  'meeting',
  'member',
  'curated_node',
  'semantic_entity',
];

export const GRAPH_EDGE_RELATION_ORDER: readonly GraphEdgeRelation[] = [
  'wiki_parent',
  'ticket_project',
  'ticket_assignee',
  'ticket_reporter',
  'project_lead',
  'project_creator',
  'meeting_organizer',
  'meeting_attendee',
  'curated',
  'mentions',
  'semantic',
  'asserted',
];

export function graphNodeKindRank(kind: GraphNodeKind) {
  return GRAPH_NODE_KIND_ORDER.indexOf(kind);
}

export function graphEdgeRelationRank(relation: GraphEdgeRelation) {
  return GRAPH_EDGE_RELATION_ORDER.indexOf(relation);
}

export function decodeNodeIdOrNotFound(nodeId: string) {
  try {
    return decodeGraphNodeId(nodeId);
  } catch {
    throw new KnowledgeGraphNodeNotFoundError();
  }
}

export function decodeEdgeIdOrNotFound(edgeId: string) {
  try {
    return decodeGraphEdgeId(edgeId);
  } catch {
    throw new KnowledgeGraphEdgeNotFoundError();
  }
}

export function decodeCursorOrScopeMismatch<T>(decode: () => T): T {
  try {
    return decode();
  } catch {
    throw new KnowledgeGraphCursorScopeMismatchError();
  }
}

export function sourceNodeId(
  kind: Exclude<GraphNodeKind, 'curated_node' | 'semantic_entity'>,
  sourceId: string,
) {
  return encodeGraphNodeId([1, 's', kind, sourceId]);
}

export function curatedNodeId(nodeId: string) {
  return encodeGraphNodeId([1, 'c', nodeId]);
}

export function semanticNodeId(
  sourceId: string,
  generationId: string,
  entityKey: string,
) {
  return encodeGraphNodeId([
    1,
    'e',
    'wiki_document',
    sourceId,
    generationId,
    entityKey,
  ]);
}

export function privateNodeKey(
  organizationId: string,
  identity: GraphNodeIdentity,
): string {
  if (identity[1] === 's') {
    const kind = identity[2] === 'member' ? 'user_reference' : identity[2];
    return graphSourceKey(kind, organizationId, identity[3]);
  }
  if (identity[1] === 'c') {
    return graphSourceKey('curated_node', organizationId, identity[2]);
  }
  return identity[5];
}

export function structuralEdgeId(
  relation: GraphEdgeRelation,
  sourceExternalId: string,
  targetExternalId: string,
) {
  return encodeGraphEdgeId([
    1,
    'r',
    relation,
    sourceExternalId,
    targetExternalId,
  ]);
}

export function curatedEdgeId(edgeId: string) {
  return encodeGraphEdgeId([1, 'ce', edgeId]);
}

export function semanticRelationEdgeId(
  sourceId: string,
  generationId: string,
  relationKey: string,
) {
  return encodeGraphEdgeId([1, 'sr', sourceId, generationId, relationKey]);
}

export function mentionsEdgeId(
  sourceId: string,
  generationId: string,
  entityKey: string,
) {
  return encodeGraphEdgeId([1, 'm', sourceId, generationId, entityKey]);
}

export function assertedEdgeId(correctionId: string) {
  return encodeGraphEdgeId([1, 'ar', correctionId]);
}

export function identityKind(identity: GraphNodeIdentity): GraphNodeKind {
  if (identity[1] === 's') return identity[2];
  if (identity[1] === 'c') return 'curated_node';
  return 'semantic_entity';
}

export function edgeIdentityRelation(
  identity: GraphEdgeIdentity,
): GraphEdgeRelation {
  if (identity[1] === 'r') return identity[2];
  if (identity[1] === 'ce') return 'curated';
  if (identity[1] === 'sr') return 'semantic';
  if (identity[1] === 'm') return 'mentions';
  return 'asserted';
}
