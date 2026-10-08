// TODO(graph-05-orval): 임시 픽스처 Suspense query다. graph-05 OpenAPI·Orval 생성 후 소비 component에서 generated Suspense hook을 직접 import하도록 바꾸고 이 파일을 삭제한다. 이 hook 이름·key 모양을 유지하려는 adapter·barrel·re-export를 만들지 않는다.
import type {
  GraphFixtureEdgeListParams,
  GraphFixtureExploreParams,
  GraphFixtureNodeListParams,
} from '@core/features/knowledge-graph/fixtures/knowledge-graph-fixture-contract';
import {
  fetchGraphFixtureEdge,
  fetchGraphFixtureEdges,
  fetchGraphFixtureExplore,
  fetchGraphFixtureNode,
  fetchGraphFixtureNodeOptions,
  fetchGraphFixtureNodes,
  fetchGraphFixtureWikiIndex,
} from '@core/features/knowledge-graph/fixtures/knowledge-graph-fixture-server';

import { queryOptions, useSuspenseQuery } from '@tanstack/react-query';

const GRAPH_FIXTURE_KEY = 'knowledge-graph-fixture';

export const graphFixtureKeys = {
  organization: (organizationId: string) =>
    [GRAPH_FIXTURE_KEY, organizationId] as const,
  explore: (organizationId: string, params: GraphFixtureExploreParams) =>
    [GRAPH_FIXTURE_KEY, organizationId, 'explore', params] as const,
  exploreAll: (organizationId: string) =>
    [GRAPH_FIXTURE_KEY, organizationId, 'explore'] as const,
  nodes: (organizationId: string, params: GraphFixtureNodeListParams) =>
    [GRAPH_FIXTURE_KEY, organizationId, 'nodes', params] as const,
  nodesAll: (organizationId: string) =>
    [GRAPH_FIXTURE_KEY, organizationId, 'nodes'] as const,
  edges: (organizationId: string, params: GraphFixtureEdgeListParams) =>
    [GRAPH_FIXTURE_KEY, organizationId, 'edges', params] as const,
  edgesAll: (organizationId: string) =>
    [GRAPH_FIXTURE_KEY, organizationId, 'edges'] as const,
  node: (organizationId: string, nodeId: string) =>
    [GRAPH_FIXTURE_KEY, organizationId, 'node', nodeId] as const,
  edge: (organizationId: string, edgeId: string) =>
    [GRAPH_FIXTURE_KEY, organizationId, 'edge', edgeId] as const,
  nodeOptions: (organizationId: string) =>
    [GRAPH_FIXTURE_KEY, organizationId, 'node-options'] as const,
  wikiIndex: (organizationId: string, documentId: string) =>
    [GRAPH_FIXTURE_KEY, organizationId, 'wiki-index', documentId] as const,
};

export function useGraphFixtureExploreSuspense(
  organizationId: string,
  params: GraphFixtureExploreParams,
) {
  return useSuspenseQuery(
    queryOptions({
      queryKey: graphFixtureKeys.explore(organizationId, params),
      queryFn: ({ signal }) =>
        fetchGraphFixtureExplore(organizationId, params, signal),
    }),
  );
}

export function useGraphFixtureNodesSuspense(
  organizationId: string,
  params: GraphFixtureNodeListParams,
) {
  return useSuspenseQuery(
    queryOptions({
      queryKey: graphFixtureKeys.nodes(organizationId, params),
      queryFn: ({ signal }) =>
        fetchGraphFixtureNodes(organizationId, params, signal),
    }),
  );
}

export function useGraphFixtureEdgesSuspense(
  organizationId: string,
  params: GraphFixtureEdgeListParams,
) {
  return useSuspenseQuery(
    queryOptions({
      queryKey: graphFixtureKeys.edges(organizationId, params),
      queryFn: ({ signal }) =>
        fetchGraphFixtureEdges(organizationId, params, signal),
    }),
  );
}

export function useGraphFixtureNodeSuspense(
  organizationId: string,
  nodeId: string,
) {
  return useSuspenseQuery(
    queryOptions({
      queryKey: graphFixtureKeys.node(organizationId, nodeId),
      queryFn: ({ signal }) =>
        fetchGraphFixtureNode(organizationId, nodeId, signal),
    }),
  );
}

export function useGraphFixtureEdgeSuspense(
  organizationId: string,
  edgeId: string,
) {
  return useSuspenseQuery(
    queryOptions({
      queryKey: graphFixtureKeys.edge(organizationId, edgeId),
      queryFn: ({ signal }) =>
        fetchGraphFixtureEdge(organizationId, edgeId, signal),
    }),
  );
}

export function useGraphFixtureNodeOptionsSuspense(organizationId: string) {
  return useSuspenseQuery(
    queryOptions({
      queryKey: graphFixtureKeys.nodeOptions(organizationId),
      queryFn: ({ signal }) =>
        fetchGraphFixtureNodeOptions(organizationId, signal),
    }),
  );
}

const WIKI_INDEX_POLL_MS = 1000;

export function useGraphFixtureWikiIndexSuspense(
  organizationId: string,
  documentId: string,
) {
  return useSuspenseQuery(
    queryOptions({
      queryKey: graphFixtureKeys.wikiIndex(organizationId, documentId),
      queryFn: ({ signal }) =>
        fetchGraphFixtureWikiIndex(organizationId, documentId, signal),
      // 요청이 진행 중일 때만 bounded polling을 한다.
      refetchInterval: (query) => {
        const status = query.state.data?.status;
        return status === 'accepted' ||
          status === 'queued' ||
          status === 'running'
          ? WIKI_INDEX_POLL_MS
          : false;
      },
    }),
  );
}
