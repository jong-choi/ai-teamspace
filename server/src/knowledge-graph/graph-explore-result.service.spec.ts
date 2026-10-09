import { GRAPH_EXPLORE_LIMITS } from '@/knowledge-graph/domain/graph-explore-limits';
import { graphPermissions } from '@/knowledge-graph/domain/graph-read-contract';
import type {
  GraphEdge,
  GraphNode,
} from '@/knowledge-graph/dto/graph-snapshot.dto';
import { GraphExploreResultService } from '@/knowledge-graph/graph-explore-result.service';
import { GraphExploreTraversalService } from '@/knowledge-graph/graph-explore-traversal.service';
import { GraphReadAssemblerService } from '@/knowledge-graph/graph-read-assembler.service';
import { sourceNodeId } from '@/knowledge-graph/graph-read-support';
import { GraphSemanticReadService } from '@/knowledge-graph/graph-semantic-read.service';
import { KnowledgeGraphStructureReader } from '@/knowledge-graph/infrastructure/graph/knowledge-graph-structure-reader.provider';
import { CuratedGraphQueryRepository } from '@/knowledge-graph/infrastructure/persistence/curated-graph-query.repository';

const node = (index: number): GraphNode => ({
  id: `node-${index.toString().padStart(3, '0')}`,
  kind: 'wiki_document',
  title: `노드-${index}-${'가'.repeat(450)}`,
  factClass: 'authoritative',
  sourceRef: null,
  permissions: graphPermissions({
    factClass: 'authoritative',
    canWriteSource: false,
    canManageCurated: false,
  }),
  editTarget: { kind: 'none', reason: 'authoritative' },
  projectionState: null,
  completeness: 'complete',
  provenance: null,
  curated: null,
});

const edge = (
  index: number,
  sourceNodeId: string,
  targetNodeId: string,
): GraphEdge => ({
  id: `edge-${index.toString().padStart(4, '0')}`,
  relation: 'wiki_parent',
  sourceNodeId,
  targetNodeId,
  directed: true,
  predicate: '관'.repeat(190),
  factClass: 'authoritative',
  sourceRef: null,
  permissions: graphPermissions({
    factClass: 'authoritative',
    canWriteSource: false,
    canManageCurated: false,
  }),
  editTarget: { kind: 'none', reason: 'authoritative' },
  projectionState: null,
  completeness: 'complete',
  provenance: null,
  curated: null,
});

describe('U8-11 explore 상한', () => {
  it('node·edge·bytes 상한에서 truncated와 nextCursor를 반환한다', () => {
    const service = new GraphExploreResultService();
    const nodes = Array.from({ length: 101 }, (_, index) => node(index));
    const edges: GraphEdge[] = [];

    for (let index = 1; index < nodes.length; index++) {
      edges.push(edge(index, nodes[0]!.id, nodes[index]!.id));
    }
    for (let index = 100; index < 350; index++) {
      const target = (index % 99) + 1;
      edges.push(
        edge(index, nodes[target]!.id, nodes[((target + 1) % 99) + 1]!.id),
      );
    }

    const result = service.build({
      organizationId: 'p8a2-unit',
      query: {
        focusKind: 'wiki_document',
        focusId: nodes[0]!.id,
        depth: 2,
        limit: 100,
      },
      depth: 2,
      seeds: [nodes[0]!],
      nodes,
      edges,
      sourceTruncated: false,
      projectionPending: false,
      completeness: 'complete',
    });

    expect(result.nodes.length).toBeLessThanOrEqual(
      GRAPH_EXPLORE_LIMITS.maxNodes,
    );
    expect(result.edges.length).toBeLessThanOrEqual(
      GRAPH_EXPLORE_LIMITS.maxEdges,
    );
    expect(
      Buffer.byteLength(
        JSON.stringify({ nodes: result.nodes, edges: result.edges }),
      ),
    ).toBeLessThanOrEqual(GRAPH_EXPLORE_LIMITS.maxResponseBytes);
    expect(result.truncated).toBe(true);
    expect(result.nextCursor).toEqual(expect.any(String));
  });

  it('구조 순회에 frontier와 hop candidate 정책 상한을 그대로 전달한다', async () => {
    const structureExpandMock = jest.fn().mockResolvedValue({
      nodes: [],
      edges: [],
      truncated: false,
    });
    const structure = {
      expand: structureExpandMock,
    } as unknown as KnowledgeGraphStructureReader;
    const assembler = {
      authorize: jest.fn().mockResolvedValue({ canManageCurated: false }),
      structuralEdges: jest.fn().mockResolvedValue({
        items: [],
        projectionPending: false,
      }),
      sourceNodes: jest.fn().mockResolvedValue([]),
    } as unknown as GraphReadAssemblerService;
    const curated = {
      listConnectedEdges: jest.fn().mockResolvedValue([]),
    } as unknown as CuratedGraphQueryRepository;
    const semantic = {
      view: jest.fn().mockResolvedValue(null),
    } as unknown as GraphSemanticReadService;
    const service = new GraphExploreTraversalService(
      assembler,
      structure,
      curated,
      semantic,
    );

    await service.traverseSeed(
      { userId: 'actor' },
      'p8a2-unit',
      {
        ...node(0),
        id: sourceNodeId(
          'wiki_document',
          '10000000-0000-4000-8000-000000000010',
        ),
      },
      2,
      'complete',
    );

    expect(structureExpandMock).toHaveBeenCalledWith(
      expect.objectContaining({
        depth: 2,
        maxFrontier: GRAPH_EXPLORE_LIMITS.maxHopFrontier,
        maxHopCandidates: GRAPH_EXPLORE_LIMITS.maxHopCandidates,
        maxNodes: GRAPH_EXPLORE_LIMITS.maxNodes,
        maxEdges: GRAPH_EXPLORE_LIMITS.maxEdges,
      }),
    );
  });
});
