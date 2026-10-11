import type {
  GraphNode,
  GraphSnapshot,
} from '@/knowledge-graph/dto/graph-snapshot.dto';
import {
  rankKnowledgeRecords,
  toKnowledgeContextView,
  toQueryTerms,
  toRelationLines,
} from '@/mcp/tools/knowledge-graph/knowledge-graph-agent-view';

function node(id: string, kind: GraphNode['kind'], title: string): GraphNode {
  return {
    id,
    kind,
    title,
    sourceRef:
      kind === 'semantic_entity'
        ? null
        : { kind, id: `source-${id}`, title, updatedAt: null },
  } as GraphNode;
}

function edge(
  relation: GraphSnapshot['edges'][number]['relation'],
  sourceNodeId: string,
  targetNodeId: string,
  predicate: string | null = null,
  directed = true,
) {
  return {
    relation,
    sourceNodeId,
    targetNodeId,
    predicate,
    directed,
  } as GraphSnapshot['edges'][number];
}

const snapshot = {
  nodes: [
    node('d1', 'wiki_document', '리뉴얼 기획서'),
    node('d0', 'wiki_document', '제품'),
    node('e1', 'semantic_entity', '최유진'),
    node('e2', 'semantic_entity', '홈'),
  ],
  edges: [
    edge('mentions', 'd1', 'e1'),
    edge('semantic', 'e1', 'e2', 'RESPONSIBLE_FOR'),
    edge('wiki_parent', 'd1', 'd0'),
    edge('semantic', 'e1', 'missing', 'USES'),
  ],
  truncated: false,
  nextCursor: null,
  completeness: 'complete',
  degradedReasons: [],
} as unknown as GraphSnapshot;

describe('toRelationLines', () => {
  it('mentions와 끝 노드가 없는 edge를 빼고 관계를 한 줄씩 적는다', () => {
    expect(toRelationLines(snapshot, 10)).toEqual({
      lines: [
        '최유진 -[RESPONSIBLE_FOR]-> 홈',
        '리뉴얼 기획서 -[wiki_parent]-> 제품',
      ],
      truncated: false,
    });
  });

  it('낱말을 주면 양 끝 이름에 그 낱말이 든 관계만 남긴다', () => {
    expect(toRelationLines(snapshot, 10, ['리뉴얼'])).toEqual({
      lines: ['리뉴얼 기획서 -[wiki_parent]-> 제품'],
      truncated: false,
    });
    expect(toRelationLines(snapshot, 10, ['정산']).lines).toEqual([]);
  });

  it('상한을 넘으면 잘랐다고 알린다', () => {
    expect(toRelationLines(snapshot, 1)).toEqual({
      lines: ['최유진 -[RESPONSIBLE_FOR]-> 홈'],
      truncated: true,
    });
  });
});

describe('toKnowledgeContextView', () => {
  it('원본이 있는 노드와 entity 이름, 관계만 남긴다', () => {
    expect(toKnowledgeContextView(snapshot, 10)).toEqual({
      nodes: [
        {
          nodeId: 'd1',
          kind: 'wiki_document',
          title: '리뉴얼 기획서',
          sourceId: 'source-d1',
        },
        {
          nodeId: 'd0',
          kind: 'wiki_document',
          title: '제품',
          sourceId: 'source-d0',
        },
      ],
      entities: ['최유진', '홈'],
      relations: [
        '최유진 -[RESPONSIBLE_FOR]-> 홈',
        '리뉴얼 기획서 -[wiki_parent]-> 제품',
      ],
      truncated: false,
    });
  });
});

describe('toQueryTerms', () => {
  it('문장형 검색어를 두 글자 이상의 낱말로 나눈다', () => {
    expect(toQueryTerms('결제·정산 개선 프로젝트, 진행 상황은 ?')).toEqual([
      '결제',
      '정산',
      '개선',
      '프로젝트',
    ]);
    expect(toQueryTerms(' 귤밭  귤밭 a ')).toEqual(['귤밭']);
  });
});

describe('rankKnowledgeRecords', () => {
  it('여러 낱말에 맞은 원본을 앞에 두고 업무 원본이 아닌 노드는 뺀다', () => {
    const project = node('p1', 'project', '결제·정산 개선');
    const ticket = node('t1', 'ticket', '결제 실패 분석');
    const records = rankKnowledgeRecords(
      [[ticket, project, node('e1', 'semantic_entity', '결제')], [project]],
      5,
    );

    expect(records).toEqual([
      {
        kind: 'project',
        nodeId: 'p1',
        sourceId: 'source-p1',
        title: '결제·정산 개선',
      },
      {
        kind: 'ticket',
        nodeId: 't1',
        sourceId: 'source-t1',
        title: '결제 실패 분석',
      },
    ]);
  });
});
