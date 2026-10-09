import { GraphEdgeRelationSchema } from '@/knowledge-graph/domain/graph-read-contract';

import { z } from 'zod';

export type GraphEdgeRelation = z.infer<typeof GraphEdgeRelationSchema>;

export type StructureNodeKind =
  | 'wiki_document'
  | 'project'
  | 'ticket'
  | 'meeting'
  | 'member'
  | 'curated_node'
  | 'semantic_entity';

export type StructureNodeRecord = {
  id: string;
  kind: StructureNodeKind;
  title: string;
  sourceId: string | null;
  sourceUpdatedAt: Date | null;
  generationId: string | null;
  localId?: string | null;
  evidenceDigest?: string | null;
  properties?: Record<string, unknown>;
};

export type StructureEdgeRecord = {
  id: string;
  relation: GraphEdgeRelation;
  sourceNodeId: string;
  targetNodeId: string;
  sourceNodeKind: StructureNodeKind;
  targetNodeKind: StructureNodeKind;
  sourceNodeSourceId: string | null;
  targetNodeSourceId: string | null;
  predicate: string | null;
  ownerKind: 'wiki_document' | 'project' | 'ticket' | 'meeting' | null;
  ownerSourceId: string | null;
  hop: 1 | 2;
};

export type StructureExpandInput = {
  organizationId: string;
  focusNodeId: string;
  depth: number;
  maxNodes: number;
  maxEdges: number;
  maxFrontier: number;
  maxHopCandidates: number;
  allowedRelations?: readonly GraphEdgeRelation[];
};

export type StructureExpandResult = {
  nodes: StructureNodeRecord[];
  edges: StructureEdgeRecord[];
  truncated: boolean;
};

export type StructureListEdgesInput = {
  organizationId: string;
  relation?: GraphEdgeRelation;
  after?: {
    relation: GraphEdgeRelation;
    sourceNodeId: string;
    targetNodeId: string;
  } | null;
  limit: number;
};

export type SemanticEntityScope = {
  sourceId: string;
  generationId: string;
};

export type SemanticEntityListInput = {
  organizationId: string;
  scopes: readonly SemanticEntityScope[];
  q?: string | null;
  after?: { title: string; key: string } | null;
  limit: number;
};

export abstract class KnowledgeGraphStructureReader {
  abstract expand(input: StructureExpandInput): Promise<StructureExpandResult>;
  abstract semanticEntities(input: {
    organizationId: string;
    sourceId: string;
    generationId: string;
    limit: number;
  }): Promise<StructureNodeRecord[]>;
  abstract listSemanticEntities(
    input: SemanticEntityListInput,
  ): Promise<StructureNodeRecord[]>;
  abstract listStructuralEdges(
    input: StructureListEdgesInput,
  ): Promise<StructureEdgeRecord[]>;
  abstract nodeDetail(input: {
    organizationId: string;
    nodeId: string;
  }): Promise<StructureNodeRecord | null>;
  abstract edgeDetail(input: {
    organizationId: string;
    relation: GraphEdgeRelation;
    sourceNodeId: string;
    targetNodeId: string;
  }): Promise<StructureEdgeRecord | null>;
}
