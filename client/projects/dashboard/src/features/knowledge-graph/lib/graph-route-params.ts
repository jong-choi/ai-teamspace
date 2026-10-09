import {
  GraphEdge,
  type GraphEdge as GraphEdgeValue,
} from '@repo/client/api-client/generated/schemas/graphEdge.zod';
import {
  GraphNode,
  type GraphNode as GraphNodeValue,
} from '@repo/client/api-client/generated/schemas/graphNode.zod';
import type { KnowledgeGraphControllerExploreParams } from '@repo/client/api-client/generated/schemas/knowledgeGraphControllerExploreParams.zod';

export type GraphDataTab = 'nodes' | 'edges';
export type GraphExploreParams = Pick<
  KnowledgeGraphControllerExploreParams,
  'focusKind' | 'focusId' | 'q'
>;

/** 데이터 센터의 탭·검색·필터·cursor는 URL이 소유한다. */
export type GraphDataCenterParams = {
  tab: GraphDataTab;
  search: string;
  kind: GraphNodeValue['kind'] | 'all';
  relation: GraphEdgeValue['relation'] | 'all';
  pageSize: GraphPageSize;
  cursor: string | null;
};

type RawSearchParams = Partial<Record<string, string | string[]>>;

export const GRAPH_PAGE_SIZES: readonly [5, 10, 20] = [5, 10, 20];
export type GraphPageSize = (typeof GRAPH_PAGE_SIZES)[number];
export const GRAPH_NODE_KINDS = GraphNode.shape.kind.options;
export const GRAPH_EDGE_RELATIONS = GraphEdge.shape.relation.options;
export const DEFAULT_GRAPH_PAGE_SIZE: GraphPageSize = 10;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function parseGraphDataCenterParams(
  raw: RawSearchParams,
): GraphDataCenterParams {
  const kind = first(raw.kind);
  const size = Number(first(raw.size));
  const cursor = first(raw.cursor);
  const relation = first(raw.relation);
  return {
    tab: first(raw.tab) === 'edges' ? 'edges' : 'nodes',
    search: first(raw.q) ?? '',
    kind: GRAPH_NODE_KINDS.find((candidate) => candidate === kind) ?? 'all',
    relation:
      GRAPH_EDGE_RELATIONS.find((candidate) => candidate === relation) ?? 'all',
    pageSize:
      GRAPH_PAGE_SIZES.find((candidate) => candidate === size) ??
      DEFAULT_GRAPH_PAGE_SIZE,
    cursor: cursor ? cursor : null,
  };
}

/** 기본값은 URL에서 빼서 공유 링크를 짧게 유지한다. */
export function toGraphDataCenterSearchParams(params: GraphDataCenterParams) {
  return {
    tab: params.tab === 'nodes' ? undefined : params.tab,
    q: params.search ? params.search : undefined,
    kind: params.kind === 'all' ? undefined : params.kind,
    relation: params.relation === 'all' ? undefined : params.relation,
    size:
      params.pageSize === DEFAULT_GRAPH_PAGE_SIZE
        ? undefined
        : String(params.pageSize),
    cursor: params.cursor ?? undefined,
  };
}

/** 그래프 뷰의 focus deep link. 예: Wiki 문서에서 `focusKind=wiki_document&focusId=<id>`. */
export function parseGraphExploreParams(
  raw: RawSearchParams,
): GraphExploreParams {
  const focusKind = first(raw.focusKind);
  const focusId = first(raw.focusId);
  const q = first(raw.q)?.trim();
  if (!focusId) return q ? { q } : {};
  return {
    focusId,
    focusKind: GRAPH_NODE_KINDS.find((candidate) => candidate === focusKind),
  };
}
