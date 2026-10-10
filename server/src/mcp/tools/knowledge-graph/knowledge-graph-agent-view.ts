import type { GraphNodeKind } from '@/knowledge-graph/domain/graph-read-contract';
import type {
  GraphNode,
  GraphSnapshot,
} from '@/knowledge-graph/dto/graph-snapshot.dto';

/** 검색어 제목 일치로 함께 돌려주는 업무 원본 종류다. */
export const KNOWLEDGE_RECORD_KINDS = [
  'project',
  'ticket',
  'meeting',
  'member',
] as const satisfies readonly GraphNodeKind[];

export type KnowledgeRecordKind = (typeof KNOWLEDGE_RECORD_KINDS)[number];

export type KnowledgeRecord = {
  kind: KnowledgeRecordKind;
  nodeId: string;
  sourceId: string | null;
  title: string;
};

export type KnowledgeContextView = {
  nodes: {
    nodeId: string;
    kind: GraphNodeKind;
    title: string;
    sourceId: string | null;
  }[];
  entities: string[];
  relations: string[];
  truncated: boolean;
};

const MAX_QUERY_TERMS = 4;
const MIN_QUERY_TERM_LENGTH = 2;

/**
 * snapshot의 edge를 모델이 바로 읽는 "A -[관계]-> B" 줄로 바꾼다.
 * 문서가 entity를 언급한다는 mentions edge는 문서마다 반복되는 잡음이라 뺀다.
 */
export function toRelationLines(
  snapshot: Pick<GraphSnapshot, 'nodes' | 'edges'>,
  limit: number,
): { lines: string[]; truncated: boolean } {
  const titles = new Map(snapshot.nodes.map((node) => [node.id, node.title]));
  const lines: string[] = [];
  for (const edge of snapshot.edges) {
    if (edge.relation === 'mentions') continue;
    const source = titles.get(edge.sourceNodeId);
    const target = titles.get(edge.targetNodeId);
    if (!source || !target) continue;
    const label = edge.predicate ?? edge.relation;
    lines.push(
      edge.directed
        ? `${source} -[${label}]-> ${target}`
        : `${source} -[${label}]- ${target}`,
    );
  }
  const unique = [...new Set(lines)];
  return { lines: unique.slice(0, limit), truncated: unique.length > limit };
}

/** explore snapshot에서 권한·편집 metadata를 걷어 내고 모델이 쓰는 값만 남긴다. */
export function toKnowledgeContextView(
  snapshot: GraphSnapshot,
  relationLimit: number,
): KnowledgeContextView {
  const relations = toRelationLines(snapshot, relationLimit);
  return {
    nodes: snapshot.nodes
      .filter((node) => node.kind !== 'semantic_entity')
      .map((node) => ({
        nodeId: node.id,
        kind: node.kind,
        title: node.title,
        sourceId: node.sourceRef?.id ?? null,
      })),
    entities: [
      ...new Set(
        snapshot.nodes
          .filter((node) => node.kind === 'semantic_entity')
          .map((node) => node.title),
      ),
    ],
    relations: relations.lines,
    truncated: snapshot.truncated || relations.truncated,
  };
}

/** 문장형 검색어를 제목 일치에 쓸 낱말로 나눈다. */
export function toQueryTerms(query: string): string[] {
  const terms = query
    .split(/[\s\p{P}\p{S}]+/u)
    .filter((term) => term.length >= MIN_QUERY_TERM_LENGTH);
  return [...new Set(terms)].slice(0, MAX_QUERY_TERMS);
}

/** 낱말별 제목 일치 결과를 합쳐 여러 낱말에 맞은 원본을 앞에 둔다. */
export function rankKnowledgeRecords(
  matchesByTerm: readonly (readonly GraphNode[])[],
  limit: number,
): KnowledgeRecord[] {
  const ranked = new Map<string, { record: KnowledgeRecord; hits: number }>();
  for (const matches of matchesByTerm) {
    for (const node of matches) {
      if (!isRecordKind(node.kind)) continue;
      const existing = ranked.get(node.id);
      if (existing) {
        existing.hits += 1;
        continue;
      }
      ranked.set(node.id, {
        record: {
          kind: node.kind,
          nodeId: node.id,
          sourceId: node.sourceRef?.id ?? null,
          title: node.title,
        },
        hits: 1,
      });
    }
  }
  return [...ranked.values()]
    .sort((left, right) => right.hits - left.hits)
    .slice(0, limit)
    .map(({ record }) => record);
}

function isRecordKind(kind: GraphNodeKind): kind is KnowledgeRecordKind {
  return (KNOWLEDGE_RECORD_KINDS as readonly GraphNodeKind[]).includes(kind);
}
