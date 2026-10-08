// TODO(graph-05-orval): 임시 픽스처 계약이다. graph-05 OpenAPI·Orval 생성 후 generated schema/type으로 직접 교체하고 이 파일을 삭제한다. 이 모양에 맞춘 adapter·barrel·re-export를 만들지 않는다.
import type { Href } from 'expo-router';

export const GRAPH_FIXTURE_NODE_KINDS = [
  'wiki_document',
  'project',
  'ticket',
  'meeting',
  'member',
  'custom',
  'concept',
  'topic',
  'technology',
  'reference',
] as const;

export type GraphFixtureNodeKind = (typeof GRAPH_FIXTURE_NODE_KINDS)[number];

// graph-03 P5 curated taxonomy와 같은 값이다.
export const GRAPH_FIXTURE_CURATED_NODE_KINDS = [
  'custom',
  'concept',
  'topic',
  'technology',
  'reference',
] as const satisfies readonly GraphFixtureNodeKind[];

export type GraphFixtureCuratedNodeKind =
  (typeof GRAPH_FIXTURE_CURATED_NODE_KINDS)[number];

// graph-03 P5 curated predicate와 같은 값이다.
export const GRAPH_FIXTURE_CURATED_PREDICATES = [
  'related_to',
  'depends_on',
  'contains',
  'references',
] as const;

export type GraphFixtureCuratedPredicate =
  (typeof GRAPH_FIXTURE_CURATED_PREDICATES)[number];

export type GraphFixtureFactClass =
  'authoritative' | 'extracted' | 'user_curated';

export type GraphFixtureProjectionState = 'synchronized' | 'pending';

export type GraphFixturePermissions = {
  canEdit: boolean;
  canDelete: boolean;
  canCorrect: boolean;
  canSuppress: boolean;
};

export type GraphFixtureSource = {
  label: string;
  // 서버가 현재 권한을 확인해 준 owner 화면 경로만 담는다. 실제 계약의 문자열 경로는 route 검증 뒤에 이동한다.
  href: Href | null;
};

export type GraphFixtureNode = {
  id: string;
  kind: GraphFixtureNodeKind;
  title: string;
  factClass: GraphFixtureFactClass;
  revision: number;
  updatedAt: string;
  projection: GraphFixtureProjectionState;
  source: GraphFixtureSource | null;
  properties: Readonly<Record<string, string>>;
  permissions: GraphFixturePermissions;
};

export type GraphFixtureEdge = {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  predicate: string;
  directed: boolean;
  factClass: GraphFixtureFactClass;
  revision: number;
  updatedAt: string;
  projection: GraphFixtureProjectionState;
  evidence: string | null;
  permissions: GraphFixturePermissions;
};

export type GraphFixtureExplore = {
  focusNodeId: string | null;
  nodes: readonly GraphFixtureNode[];
  edges: readonly GraphFixtureEdge[];
  truncated: boolean;
};

export type GraphFixtureNodeDetail = GraphFixtureNode & {
  connectedEdgeCount: number;
  connectedCuratedEdgeCount: number;
};

export type GraphFixtureEdgeDetail = GraphFixtureEdge & {
  sourceNode: Pick<GraphFixtureNode, 'id' | 'kind' | 'title' | 'factClass'>;
  targetNode: Pick<GraphFixtureNode, 'id' | 'kind' | 'title' | 'factClass'>;
};

export type GraphFixtureNodeOption = Pick<
  GraphFixtureNode,
  'id' | 'kind' | 'title' | 'factClass'
>;

export type GraphFixturePage<T> = {
  items: readonly T[];
  totalCount: number;
  pageIndex: number;
  pageCount: number;
  nextCursor: string | null;
  previousCursor: string | null;
};

export const GRAPH_FIXTURE_PAGE_SIZES = [5, 10, 20] as const;

export type GraphFixturePageSize = (typeof GRAPH_FIXTURE_PAGE_SIZES)[number];

export type GraphFixtureExploreParams = {
  focusKind?: GraphFixtureNodeKind;
  focusId?: string;
};

export type GraphFixtureNodeListParams = {
  search: string;
  kind: GraphFixtureNodeKind | 'all';
  pageSize: GraphFixturePageSize;
  cursor: string | null;
};

export type GraphFixtureEdgeListParams = {
  search: string;
  pageSize: GraphFixturePageSize;
  cursor: string | null;
};

export type GraphFixtureCreateNode = {
  kind: GraphFixtureCuratedNodeKind;
  title: string;
};

export type GraphFixtureUpdateNode = GraphFixtureCreateNode & {
  revision: number;
};

export type GraphFixtureCorrectNode = {
  kind: GraphFixtureNodeKind;
  title: string;
  revision: number;
};

export type GraphFixtureCreateEdge = {
  sourceNodeId: string;
  targetNodeId: string;
  predicate: GraphFixtureCuratedPredicate;
  directed: boolean;
};

export type GraphFixtureUpdateEdge = GraphFixtureCreateEdge & {
  revision: number;
};

export type GraphFixtureMutationResult = {
  id: string;
  revision: number;
  projection: GraphFixtureProjectionState;
};

export type GraphFixtureWikiIndexStatus =
  | 'not_indexed'
  | 'accepted'
  | 'queued'
  | 'running'
  | 'up_to_date'
  | 'stale'
  | 'failed';

export type GraphFixtureWikiIndex = {
  documentId: string;
  status: GraphFixtureWikiIndexStatus;
  requestedAt: string | null;
  completedAt: string | null;
};
