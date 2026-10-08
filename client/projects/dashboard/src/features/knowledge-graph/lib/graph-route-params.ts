import {
  GRAPH_FIXTURE_NODE_KINDS,
  GRAPH_FIXTURE_PAGE_SIZES,
  type GraphFixtureExploreParams,
  type GraphFixtureNodeKind,
  type GraphFixturePageSize,
} from '@core/features/knowledge-graph/fixtures/knowledge-graph-fixture-contract';

export type GraphDataTab = 'nodes' | 'edges';

/** 데이터 센터의 탭·검색·필터·cursor는 URL이 소유한다. */
export type GraphDataCenterParams = {
  tab: GraphDataTab;
  search: string;
  kind: GraphFixtureNodeKind | 'all';
  pageSize: GraphFixturePageSize;
  cursor: string | null;
};

type RawSearchParams = Partial<Record<string, string | string[]>>;

export const DEFAULT_GRAPH_PAGE_SIZE: GraphFixturePageSize = 10;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function parseGraphDataCenterParams(
  raw: RawSearchParams,
): GraphDataCenterParams {
  const kind = first(raw.kind);
  const size = Number(first(raw.size));
  const cursor = first(raw.cursor);
  return {
    tab: first(raw.tab) === 'edges' ? 'edges' : 'nodes',
    search: first(raw.q) ?? '',
    kind:
      GRAPH_FIXTURE_NODE_KINDS.find((candidate) => candidate === kind) ?? 'all',
    pageSize:
      GRAPH_FIXTURE_PAGE_SIZES.find((candidate) => candidate === size) ??
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
): GraphFixtureExploreParams {
  const focusKind = first(raw.focusKind);
  const focusId = first(raw.focusId);
  if (!focusId) return {};
  return {
    focusId,
    focusKind: GRAPH_FIXTURE_NODE_KINDS.find(
      (candidate) => candidate === focusKind,
    ),
  };
}
