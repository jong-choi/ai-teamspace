import { Inject, Injectable, type OnApplicationShutdown } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';

import { createNeo4jGraph } from '@repo/knowledge-graph';
import knowledgeGraphConfig from '@/knowledge-graph/config/knowledge-graph.config';
import { KnowledgeGraphUnavailableError } from '@/knowledge-graph/domain/graph-read.error';
import {
  type GraphEdgeRelation,
  KnowledgeGraphStructureReader,
  type SemanticEntityListInput,
  type StructureEdgeRecord,
  type StructureNodeRecord,
} from '@/knowledge-graph/infrastructure/graph/knowledge-graph-structure-reader.provider';
import {
  GRAPH_STRUCTURE_RELATION_TYPES,
  READ_SEMANTIC_ENTITIES_FOR_SCOPES,
  READ_STRUCTURE_EDGE_DETAIL,
  READ_STRUCTURE_EDGES,
  READ_STRUCTURE_NEIGHBORS,
  READ_STRUCTURE_NODE_DETAIL,
} from '@/knowledge-graph/knowledge-graph-read-queries';

const relationByType = new Map<string, GraphEdgeRelation>([
  ['KG_WIKI_PARENT', 'wiki_parent'],
  ['KG_TICKET_PROJECT', 'ticket_project'],
  ['KG_TICKET_ASSIGNEE', 'ticket_assignee'],
  ['KG_TICKET_REPORTER', 'ticket_reporter'],
  ['KG_PROJECT_LEAD', 'project_lead'],
  ['KG_PROJECT_CREATOR', 'project_creator'],
  ['KG_MEETING_ORGANIZER', 'meeting_organizer'],
  ['KG_MEETING_ATTENDEE', 'meeting_attendee'],
]);
const typeByRelation = new Map(
  [...relationByType.entries()].map(
    ([type, relation]) => [relation, type] as const,
  ),
);
const relationRank = new Map<GraphEdgeRelation, number>([
  ['wiki_parent', 0],
  ['ticket_project', 1],
  ['ticket_assignee', 2],
  ['ticket_reporter', 3],
  ['project_lead', 4],
  ['project_creator', 5],
  ['meeting_organizer', 6],
  ['meeting_attendee', 7],
]);

const structureNodeKinds = new Set<StructureNodeRecord['kind']>([
  'wiki_document',
  'project',
  'ticket',
  'meeting',
  'member',
  'curated_node',
  'semantic_entity',
]);

@Injectable()
export class LangchainNeo4jGraphStructureReaderAdapter
  extends KnowledgeGraphStructureReader
  implements OnApplicationShutdown
{
  private connection: Promise<
    Awaited<ReturnType<typeof createNeo4jGraph>>
  > | null = null;

  constructor(
    @Inject(knowledgeGraphConfig.KEY)
    private readonly config: ConfigType<typeof knowledgeGraphConfig>,
  ) {
    super();
  }

  async expand(input: Parameters<KnowledgeGraphStructureReader['expand']>[0]) {
    try {
      const focus = await this.nodeDetail({
        organizationId: input.organizationId,
        nodeId: input.focusNodeId,
      });
      if (!focus) return { nodes: [], edges: [], truncated: false };

      const graph = await this.getGraph();
      const relationTypes = this.relationTypes(input.allowedRelations);
      const nodes = new Map<string, StructureNodeRecord>([[focus.id, focus]]);
      const edges = new Map<string, StructureEdgeRecord>();
      const visited = new Set<string>([focus.id]);
      let frontier = [focus.id];
      let truncated = false;

      for (let hop = 1 as 1 | 2; hop <= input.depth; hop = (hop + 1) as 1 | 2) {
        if (!frontier.length) break;
        if (hop === 2 && frontier.length > input.maxFrontier) {
          frontier = frontier.slice(0, input.maxFrontier);
          truncated = true;
        }
        const perNodeLimit = Math.max(
          1,
          Math.floor(input.maxHopCandidates / Math.max(frontier.length, 1)),
        );
        const rows = await graph.query(READ_STRUCTURE_NEIGHBORS, {
          organizationId: input.organizationId,
          frontierKeys: frontier,
          relations: relationTypes,
          perNodeLimit: perNodeLimit + 1,
        });
        const groupedRows = new Map<string, Record<string, unknown>[]>();
        for (const row of rows) {
          const frontierKey = String(row.frontierKey ?? '');
          const group = groupedRows.get(frontierKey) ?? [];
          group.push(row);
          groupedRows.set(frontierKey, group);
        }
        const hopEdges: StructureEdgeRecord[] = [];
        for (const frontierKey of frontier) {
          const group = groupedRows.get(frontierKey) ?? [];
          if (group.length > perNodeLimit) truncated = true;
          for (const row of group.slice(0, perNodeLimit)) {
            const edge = this.edgeFromRow(row, hop);
            if (edge) hopEdges.push(edge);
          }
        }
        hopEdges.sort((left, right) => this.compareEdges(left, right));

        const nextFrontier: string[] = [];
        for (const edge of hopEdges.slice(0, input.maxHopCandidates)) {
          if (edges.size >= input.maxEdges) {
            truncated = true;
            break;
          }
          const endpointRows = [
            this.nodeFromEdge(edge, 'source'),
            this.nodeFromEdge(edge, 'target'),
          ];
          let canInclude = true;
          for (const node of endpointRows) {
            if (!nodes.has(node.id) && nodes.size >= input.maxNodes) {
              canInclude = false;
              truncated = true;
              break;
            }
          }
          if (!canInclude) continue;
          for (const node of endpointRows) {
            nodes.set(node.id, node);
            if (!visited.has(node.id) && !nextFrontier.includes(node.id)) {
              nextFrontier.push(node.id);
            }
          }
          edges.set(edge.id, edge);
        }
        if (hopEdges.length > input.maxHopCandidates) truncated = true;
        nextFrontier.forEach((key) => visited.add(key));
        frontier = nextFrontier;
      }

      return {
        nodes: [...nodes.values()],
        edges: [...edges.values()],
        truncated,
      };
    } catch (error) {
      throw this.toUnavailable(error);
    }
  }

  semanticEntities(input: {
    organizationId: string;
    sourceId: string;
    generationId: string;
    limit: number;
  }) {
    return this.listSemanticEntities({
      organizationId: input.organizationId,
      scopes: [{ sourceId: input.sourceId, generationId: input.generationId }],
      limit: input.limit,
    });
  }

  async listSemanticEntities(input: SemanticEntityListInput) {
    if (!input.scopes.length) return [];
    try {
      const graph = await this.getGraph();
      const rows = await graph.query(READ_SEMANTIC_ENTITIES_FOR_SCOPES, {
        organizationId: input.organizationId,
        scopes: input.scopes,
        q: input.q ?? null,
        afterTitle: input.after?.title ?? null,
        afterKey: input.after?.key ?? '',
        limit: input.limit,
      });
      return rows.map((row) => ({
        id: String(row.id),
        kind: 'semantic_entity' as const,
        title: String(row.title),
        localId: row.localId == null ? null : String(row.localId),
        evidenceDigest:
          row.evidenceDigest == null ? null : String(row.evidenceDigest),
        sourceId: String(row.sourceId),
        sourceUpdatedAt: null,
        generationId: String(row.generationId),
      }));
    } catch (error) {
      throw this.toUnavailable(error);
    }
  }

  async listStructuralEdges(
    input: Parameters<KnowledgeGraphStructureReader['listStructuralEdges']>[0],
  ) {
    try {
      const graph = await this.getGraph();
      const relationTypes = this.relationTypes(
        input.relation ? [input.relation] : undefined,
      );
      if (!relationTypes.length) return [];
      const afterType = input.after
        ? (typeByRelation.get(input.after.relation) ?? null)
        : null;
      const rows = await graph.query(READ_STRUCTURE_EDGES, {
        organizationId: input.organizationId,
        relations: relationTypes,
        afterType,
        afterSourceKey: input.after?.sourceNodeId ?? '',
        afterTargetKey: input.after?.targetNodeId ?? '',
        limit: input.limit,
      });
      const result: StructureEdgeRecord[] = [];
      for (const row of rows) {
        const edge = this.edgeFromRow(row, 1);
        if (edge) result.push(edge);
      }
      return result;
    } catch (error) {
      throw this.toUnavailable(error);
    }
  }

  async nodeDetail(input: { organizationId: string; nodeId: string }) {
    try {
      const graph = await this.getGraph();
      const [row] = await graph.query(READ_STRUCTURE_NODE_DETAIL, input);
      if (!row) return null;
      const kind = this.structureKind(row.kind);
      if (!kind) return null;
      return {
        id: String(row.id),
        kind,
        title: String(row.title),
        sourceId: row.sourceId == null ? null : String(row.sourceId),
        sourceUpdatedAt: this.dateOrNull(row.sourceUpdatedAt),
        generationId: null,
      };
    } catch (error) {
      throw this.toUnavailable(error);
    }
  }

  async edgeDetail(
    input: Parameters<KnowledgeGraphStructureReader['edgeDetail']>[0],
  ) {
    const relationshipType = typeByRelation.get(input.relation);
    if (!relationshipType) return null;
    try {
      const graph = await this.getGraph();
      const [row] = await graph.query(READ_STRUCTURE_EDGE_DETAIL, {
        organizationId: input.organizationId,
        relationshipType,
        sourceKey: input.sourceNodeId,
        targetKey: input.targetNodeId,
      });
      return row ? this.edgeFromRow(row, 1) : null;
    } catch (error) {
      throw this.toUnavailable(error);
    }
  }

  async onApplicationShutdown() {
    const connection = this.connection;
    this.connection = null;
    if (connection) await (await connection).close();
  }

  private async getGraph() {
    this.connection ??= (async () => {
      if (!this.config.url || !this.config.username || !this.config.password)
        throw new KnowledgeGraphUnavailableError();
      return createNeo4jGraph({
        url: this.config.url,
        username: this.config.username,
        password: this.config.password,
        database: this.config.database,
        timeoutMs: this.config.query?.graphReadTimeoutMs ?? 3000,
      });
    })();
    try {
      return await this.connection;
    } catch (error) {
      this.connection = null;
      throw error;
    }
  }

  private relationTypes(allowed?: readonly GraphEdgeRelation[]) {
    if (!allowed) return [...GRAPH_STRUCTURE_RELATION_TYPES];
    return allowed
      .map((relation) => typeByRelation.get(relation))
      .filter((type): type is string => Boolean(type));
  }

  private edgeFromRow(row: Record<string, unknown>, hop: 1 | 2) {
    const relationshipType = String(row.relationshipType ?? '');
    const relation = relationByType.get(relationshipType);
    const sourceKind = this.structureKind(row.sourceKind);
    const targetKind = this.structureKind(row.targetKind);
    if (!relation || !sourceKind || !targetKind) return null;
    const sourceNodeId = String(row.sourceKey);
    const targetNodeId = String(row.targetKey);
    const sourceId = row.sourceId == null ? null : String(row.sourceId);
    const targetId = row.targetId == null ? null : String(row.targetId);
    const owner = this.ownerForRelation(relation, sourceKind, sourceId);
    return {
      id: JSON.stringify([relationshipType, sourceNodeId, targetNodeId]),
      relation,
      sourceNodeId,
      targetNodeId,
      sourceNodeKind: sourceKind,
      targetNodeKind: targetKind,
      sourceNodeSourceId: sourceId,
      targetNodeSourceId: targetId,
      predicate: null,
      ownerKind: owner.kind,
      ownerSourceId: owner.id,
      hop,
    } satisfies StructureEdgeRecord;
  }

  private nodeFromEdge(
    edge: StructureEdgeRecord,
    endpoint: 'source' | 'target',
  ): StructureNodeRecord {
    const source = endpoint === 'source';
    const sourceId = source ? edge.sourceNodeSourceId : edge.targetNodeSourceId;
    return {
      id: source ? edge.sourceNodeId : edge.targetNodeId,
      kind: source ? edge.sourceNodeKind : edge.targetNodeKind,
      title: sourceId ?? (source ? edge.sourceNodeId : edge.targetNodeId),
      sourceId,
      sourceUpdatedAt: null,
      generationId: null,
    };
  }

  private ownerForRelation(
    relation: GraphEdgeRelation,
    sourceKind: StructureNodeRecord['kind'],
    sourceId: string | null,
  ): {
    kind: 'wiki_document' | 'project' | 'ticket' | 'meeting' | null;
    id: string | null;
  } {
    if (relation === 'wiki_parent')
      return { kind: 'wiki_document', id: sourceId };
    if (relation.startsWith('ticket_')) return { kind: 'ticket', id: sourceId };
    if (relation.startsWith('project_'))
      return { kind: 'project', id: sourceId };
    if (relation.startsWith('meeting_'))
      return { kind: 'meeting', id: sourceId };
    if (
      sourceKind === 'wiki_document' ||
      sourceKind === 'project' ||
      sourceKind === 'ticket' ||
      sourceKind === 'meeting'
    )
      return { kind: sourceKind, id: sourceId };
    return { kind: null, id: null };
  }

  private compareEdges(left: StructureEdgeRecord, right: StructureEdgeRecord) {
    return (
      (relationRank.get(left.relation) ?? 99) -
        (relationRank.get(right.relation) ?? 99) ||
      left.sourceNodeId.localeCompare(right.sourceNodeId) ||
      left.targetNodeId.localeCompare(right.targetNodeId)
    );
  }

  private structureKind(value: unknown): StructureNodeRecord['kind'] | null {
    const kind = String(value ?? '') as StructureNodeRecord['kind'];
    return structureNodeKinds.has(kind) ? kind : null;
  }

  private dateOrNull(value: unknown) {
    if (value == null) return null;
    const date = value instanceof Date ? value : new Date(String(value));
    return Number.isNaN(date.valueOf()) ? null : date;
  }

  private toUnavailable(error: unknown) {
    if (error instanceof KnowledgeGraphUnavailableError) return error;
    return new KnowledgeGraphUnavailableError();
  }
}
