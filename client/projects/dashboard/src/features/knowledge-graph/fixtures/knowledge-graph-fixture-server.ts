// TODO(graph-05-orval): 임시 픽스처 서버다. graph-05 REST가 생기면 generated query/mutation hook이 실제 서버를 호출하므로 이 파일을 삭제한다. 이 동작을 흉내 내는 adapter·barrel·re-export를 만들지 않는다.
import type { ProblemDetails } from '@repo/client/api-client/schemas';
import type {
  GraphFixtureCorrectNode,
  GraphFixtureCreateEdge,
  GraphFixtureCreateNode,
  GraphFixtureEdge,
  GraphFixtureEdgeDetail,
  GraphFixtureEdgeListParams,
  GraphFixtureExplore,
  GraphFixtureExploreParams,
  GraphFixtureMutationResult,
  GraphFixtureNode,
  GraphFixtureNodeDetail,
  GraphFixtureNodeListParams,
  GraphFixtureNodeOption,
  GraphFixturePage,
  GraphFixturePermissions,
  GraphFixtureUpdateEdge,
  GraphFixtureUpdateNode,
  GraphFixtureWikiIndex,
} from '@core/features/knowledge-graph/fixtures/knowledge-graph-fixture-contract';

const FIXTURE_LATENCY_MS = 220;
const FIXTURE_UPDATED_AT = '2026-10-09T01:00:00.000Z';

const READ_ONLY: GraphFixturePermissions = {
  canEdit: false,
  canDelete: false,
  canCorrect: false,
  canSuppress: false,
};
const CORRECTABLE: GraphFixturePermissions = {
  canEdit: false,
  canDelete: false,
  canCorrect: true,
  canSuppress: true,
};
const CURATED: GraphFixturePermissions = {
  canEdit: true,
  canDelete: true,
  canCorrect: false,
  canSuppress: false,
};

type FixtureDataset = {
  nodes: GraphFixtureNode[];
  edges: GraphFixtureEdge[];
  sequence: number;
  wikiIndex: Map<string, { requestedAt: number | null }>;
};

const datasets = new Map<string, FixtureDataset>();

function node(
  id: string,
  kind: GraphFixtureNode['kind'],
  title: string,
  factClass: GraphFixtureNode['factClass'],
  source: GraphFixtureNode['source'],
  properties: GraphFixtureNode['properties'] = {},
): GraphFixtureNode {
  return {
    id,
    kind,
    title,
    factClass,
    revision: 1,
    updatedAt: FIXTURE_UPDATED_AT,
    projection: 'synchronized',
    source,
    properties,
    permissions:
      factClass === 'user_curated'
        ? CURATED
        : factClass === 'extracted'
          ? CORRECTABLE
          : READ_ONLY,
  };
}

function edge(
  id: string,
  sourceNodeId: string,
  predicate: string,
  targetNodeId: string,
  factClass: GraphFixtureEdge['factClass'],
  options: { directed?: boolean; evidence?: string } = {},
): GraphFixtureEdge {
  return {
    id,
    sourceNodeId,
    targetNodeId,
    predicate,
    directed: options.directed ?? true,
    factClass,
    revision: 1,
    updatedAt: FIXTURE_UPDATED_AT,
    projection: 'synchronized',
    evidence: options.evidence ?? null,
    permissions:
      factClass === 'user_curated'
        ? CURATED
        : factClass === 'extracted'
          ? CORRECTABLE
          : READ_ONLY,
  };
}

function seedDataset(): FixtureDataset {
  const wikiSource = { label: '위키 문서', href: null };
  return {
    sequence: 100,
    wikiIndex: new Map(),
    nodes: [
      node(
        'fx-wiki-arch',
        'wiki_document',
        'Work OS 아키텍처 개요',
        'authoritative',
        wikiSource,
        { 작성자: 'Alex' },
      ),
      node(
        'fx-wiki-sec',
        'wiki_document',
        '보안 감사 체크리스트',
        'authoritative',
        wikiSource,
      ),
      node(
        'fx-project-core',
        'project',
        'Work OS Core',
        'authoritative',
        { label: '프로젝트', href: '/projects' },
        { 키: 'OS' },
      ),
      node(
        'fx-project-rag',
        'project',
        'GraphRAG 엔진',
        'authoritative',
        { label: '프로젝트', href: '/projects' },
        { 키: 'RAG' },
      ),
      node(
        'fx-ticket-142',
        'ticket',
        'OS-142 그래프 투영 fencing',
        'authoritative',
        { label: '티켓', href: '/projects' },
        { 상태: '진행 중' },
      ),
      node(
        'fx-meeting-review',
        'meeting',
        '아키텍처 주간 리뷰',
        'authoritative',
        { label: '회의', href: '/calendar' },
      ),
      node(
        'fx-member-alex',
        'member',
        'Alex (Lead Arch)',
        'authoritative',
        null,
        { 역할: 'owner' },
      ),
      node(
        'fx-concept-kg',
        'concept',
        '지식 그래프',
        'extracted',
        { label: 'AI 추출 · Work OS 아키텍처 개요', href: null },
        { 모델: 'gpt-oss:120b' },
      ),
      node('fx-tech-neo4j', 'technology', 'Neo4j', 'extracted', {
        label: 'AI 추출 · Work OS 아키텍처 개요',
        href: null,
      }),
      node('fx-tech-vector', 'technology', '벡터 검색', 'extracted', {
        label: 'AI 추출 · GraphRAG 엔진',
        href: null,
      }),
      node('fx-topic-search', 'topic', '검색 품질 개선', 'user_curated', {
        label: '사용자 정리',
        href: null,
      }),
      node(
        'fx-custom-onboarding',
        'custom',
        '온보딩 가이드 초안',
        'user_curated',
        { label: '사용자 정리', href: null },
      ),
      node(
        'fx-reference-rfc',
        'reference',
        'RFC 9457 Problem Details',
        'user_curated',
        { label: '사용자 정리', href: null },
        { URL: 'rfc-editor.org/rfc/rfc9457' },
      ),
    ],
    edges: [
      edge(
        'fx-edge-1',
        'fx-member-alex',
        'leads',
        'fx-project-core',
        'authoritative',
      ),
      edge(
        'fx-edge-2',
        'fx-ticket-142',
        'in_project',
        'fx-project-core',
        'authoritative',
      ),
      edge(
        'fx-edge-3',
        'fx-meeting-review',
        'organized_by',
        'fx-member-alex',
        'authoritative',
      ),
      edge(
        'fx-edge-4',
        'fx-project-core',
        'depends_on',
        'fx-project-rag',
        'authoritative',
      ),
      edge(
        'fx-edge-5',
        'fx-wiki-arch',
        'mentions',
        'fx-concept-kg',
        'extracted',
        { evidence: '“PG를 원본으로 두고 지식 그래프는 projection으로…”' },
      ),
      edge(
        'fx-edge-6',
        'fx-wiki-arch',
        'mentions',
        'fx-tech-neo4j',
        'extracted',
        { evidence: '“Neo4j Community를 투영 저장소로 사용한다.”' },
      ),
      edge(
        'fx-edge-7',
        'fx-project-rag',
        'uses',
        'fx-tech-vector',
        'extracted',
        { evidence: '“768차원 임베딩으로 벡터 검색을 수행한다.”' },
      ),
      edge(
        'fx-edge-8',
        'fx-topic-search',
        'references',
        'fx-wiki-arch',
        'user_curated',
      ),
      edge(
        'fx-edge-9',
        'fx-reference-rfc',
        'references',
        'fx-project-rag',
        'user_curated',
      ),
      edge(
        'fx-edge-10',
        'fx-custom-onboarding',
        'contains',
        'fx-topic-search',
        'user_curated',
      ),
      edge(
        'fx-edge-11',
        'fx-topic-search',
        'related_to',
        'fx-reference-rfc',
        'user_curated',
        { directed: false },
      ),
      edge(
        'fx-edge-12',
        'fx-wiki-sec',
        'mentions',
        'fx-reference-rfc',
        'extracted',
        { evidence: '“오류 응답은 RFC 9457 형식을 따른다.”' },
      ),
    ],
  };
}

function datasetFor(organizationId: string): FixtureDataset {
  const existing = datasets.get(organizationId);
  if (existing) return existing;
  const created = seedDataset();
  datasets.set(organizationId, created);
  return created;
}

// 응답은 실제 HTTP처럼 복사본이어야 cache 밖에서 값이 바뀌지 않는다.
function snapshot<T>(value: T): T {
  const copy: T = JSON.parse(JSON.stringify(value));
  return copy;
}

function wait(signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, FIXTURE_LATENCY_MS);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(signal.reason);
    });
  });
}

function problem(
  status: number,
  title: string,
  detail: string,
  errorCode: string,
): ProblemDetails {
  return { type: 'about:blank', title, status, detail, errorCode };
}

function nextId(dataset: FixtureDataset, prefix: string): string {
  dataset.sequence += 1;
  return `fx-${prefix}-${dataset.sequence}`;
}

function requireNode(
  dataset: FixtureDataset,
  nodeId: string,
): GraphFixtureNode {
  const found = dataset.nodes.find(({ id }) => id === nodeId);
  if (!found) {
    throw problem(
      404,
      '노드를 찾을 수 없습니다',
      '삭제되었거나 접근할 수 없는 노드입니다.',
      'graph_node_not_found',
    );
  }
  return found;
}

function requireEdge(
  dataset: FixtureDataset,
  edgeId: string,
): GraphFixtureEdge {
  const found = dataset.edges.find(({ id }) => id === edgeId);
  if (!found) {
    throw problem(
      404,
      '관계를 찾을 수 없습니다',
      '삭제되었거나 접근할 수 없는 관계입니다.',
      'graph_edge_not_found',
    );
  }
  return found;
}

function requireRevision(current: number, expected: number) {
  if (current !== expected) {
    throw problem(
      409,
      '다른 변경과 충돌했습니다',
      '다른 사용자가 먼저 수정했습니다. 최신 내용을 확인한 뒤 다시 저장해 주세요.',
      'graph_revision_conflict',
    );
  }
}

function toOption({
  id,
  kind,
  title,
  factClass,
}: GraphFixtureNode): GraphFixtureNodeOption {
  return { id, kind, title, factClass };
}

function paginate<T>(
  items: readonly T[],
  pageSize: number,
  cursor: string | null,
): GraphFixturePage<T> {
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const requested = cursor ? Number.parseInt(cursor, 10) : 0;
  const pageIndex = Math.min(
    Math.max(0, Number.isFinite(requested) ? requested : 0),
    pageCount - 1,
  );
  const start = pageIndex * pageSize;
  return {
    items: items.slice(start, start + pageSize),
    totalCount: items.length,
    pageIndex,
    pageCount,
    nextCursor: pageIndex + 1 < pageCount ? String(pageIndex + 1) : null,
    previousCursor: pageIndex > 0 ? String(pageIndex - 1) : null,
  };
}

// graph-03 P5 정책: references만 WorkOS 원본 종단·self-loop를 허용하고, related_to만 무방향을 허용한다.
function validateEdgeInput(
  dataset: FixtureDataset,
  input: GraphFixtureCreateEdge,
  ignoreEdgeId?: string,
) {
  const source = requireNode(dataset, input.sourceNodeId);
  const target = requireNode(dataset, input.targetNodeId);
  if (
    input.predicate !== 'references' &&
    (source.factClass !== 'user_curated' || target.factClass !== 'user_curated')
  ) {
    throw problem(
      422,
      '연결할 수 없는 노드입니다',
      'references 외의 관계는 사용자 노드끼리만 연결할 수 있습니다.',
      'graph_edge_endpoint_rejected',
    );
  }
  if (input.predicate !== 'references' && source.id === target.id) {
    throw problem(
      422,
      '자기 자신과 연결할 수 없습니다',
      '자기 참조는 references 관계에서만 허용됩니다.',
      'graph_edge_self_loop_rejected',
    );
  }
  if (!input.directed && input.predicate !== 'related_to') {
    throw problem(
      422,
      '방향이 필요한 관계입니다',
      '무방향 관계는 related_to에서만 사용할 수 있습니다.',
      'graph_edge_direction_rejected',
    );
  }
  const duplicate = dataset.edges.some(
    (candidate) =>
      candidate.id !== ignoreEdgeId &&
      candidate.factClass === 'user_curated' &&
      candidate.predicate === input.predicate &&
      ((candidate.sourceNodeId === input.sourceNodeId &&
        candidate.targetNodeId === input.targetNodeId) ||
        (!input.directed &&
          candidate.sourceNodeId === input.targetNodeId &&
          candidate.targetNodeId === input.sourceNodeId)),
  );
  if (duplicate) {
    throw problem(
      409,
      '이미 같은 관계가 있습니다',
      '같은 출발·도착·서술어의 관계가 이미 존재합니다.',
      'graph_edge_duplicate',
    );
  }
}

function connectedEdges(dataset: FixtureDataset, nodeId: string) {
  return dataset.edges.filter(
    ({ sourceNodeId, targetNodeId }) =>
      sourceNodeId === nodeId || targetNodeId === nodeId,
  );
}

function markPending<T extends { projection: GraphFixtureNode['projection'] }>(
  record: T,
): T {
  record.projection = 'pending';
  // 실제 서버에서는 Outbox→Neo4j 반영 후 synchronized가 된다.
  setTimeout(() => {
    record.projection = 'synchronized';
  }, 2500);
  return record;
}

export async function fetchGraphFixtureExplore(
  organizationId: string,
  params: GraphFixtureExploreParams,
  signal?: AbortSignal,
): Promise<GraphFixtureExplore> {
  await wait(signal);
  const dataset = datasetFor(organizationId);
  const focus = params.focusId
    ? dataset.nodes.find(
        ({ id, kind }) =>
          id === params.focusId &&
          (!params.focusKind || kind === params.focusKind),
      )
    : undefined;
  if (!focus) {
    return snapshot({
      focusNodeId: null,
      nodes: dataset.nodes,
      edges: dataset.edges,
      truncated: false,
    });
  }
  const neighborIds = new Set([focus.id]);
  for (const candidate of connectedEdges(dataset, focus.id)) {
    neighborIds.add(candidate.sourceNodeId);
    neighborIds.add(candidate.targetNodeId);
  }
  return snapshot({
    focusNodeId: focus.id,
    nodes: dataset.nodes.filter(({ id }) => neighborIds.has(id)),
    edges: dataset.edges.filter(
      ({ sourceNodeId, targetNodeId }) =>
        neighborIds.has(sourceNodeId) && neighborIds.has(targetNodeId),
    ),
    truncated: neighborIds.size < dataset.nodes.length,
  });
}

export async function fetchGraphFixtureNodes(
  organizationId: string,
  params: GraphFixtureNodeListParams,
  signal?: AbortSignal,
): Promise<GraphFixturePage<GraphFixtureNode>> {
  await wait(signal);
  const search = params.search.trim().toLowerCase();
  const filtered = datasetFor(organizationId).nodes.filter(
    (candidate) =>
      (params.kind === 'all' || candidate.kind === params.kind) &&
      (!search ||
        candidate.title.toLowerCase().includes(search) ||
        candidate.id.toLowerCase().includes(search)),
  );
  return snapshot(paginate(filtered, params.pageSize, params.cursor));
}

export async function fetchGraphFixtureEdges(
  organizationId: string,
  params: GraphFixtureEdgeListParams,
  signal?: AbortSignal,
): Promise<GraphFixturePage<GraphFixtureEdgeDetail>> {
  await wait(signal);
  const dataset = datasetFor(organizationId);
  const search = params.search.trim().toLowerCase();
  const details = dataset.edges.map((candidate) =>
    toEdgeDetail(dataset, candidate),
  );
  const filtered = details.filter(
    (candidate) =>
      !search ||
      candidate.predicate.toLowerCase().includes(search) ||
      candidate.sourceNode.title.toLowerCase().includes(search) ||
      candidate.targetNode.title.toLowerCase().includes(search),
  );
  return snapshot(paginate(filtered, params.pageSize, params.cursor));
}

function toEdgeDetail(
  dataset: FixtureDataset,
  candidate: GraphFixtureEdge,
): GraphFixtureEdgeDetail {
  return {
    ...candidate,
    sourceNode: toOption(requireNode(dataset, candidate.sourceNodeId)),
    targetNode: toOption(requireNode(dataset, candidate.targetNodeId)),
  };
}

export async function fetchGraphFixtureNode(
  organizationId: string,
  nodeId: string,
  signal?: AbortSignal,
): Promise<GraphFixtureNodeDetail> {
  await wait(signal);
  const dataset = datasetFor(organizationId);
  const found = requireNode(dataset, nodeId);
  const connected = connectedEdges(dataset, nodeId);
  return snapshot({
    ...found,
    connectedEdgeCount: connected.length,
    connectedCuratedEdgeCount: connected.filter(
      ({ factClass }) => factClass === 'user_curated',
    ).length,
  });
}

export async function fetchGraphFixtureEdge(
  organizationId: string,
  edgeId: string,
  signal?: AbortSignal,
): Promise<GraphFixtureEdgeDetail> {
  await wait(signal);
  const dataset = datasetFor(organizationId);
  return snapshot(toEdgeDetail(dataset, requireEdge(dataset, edgeId)));
}

export async function fetchGraphFixtureNodeOptions(
  organizationId: string,
  signal?: AbortSignal,
): Promise<readonly GraphFixtureNodeOption[]> {
  await wait(signal);
  return snapshot(datasetFor(organizationId).nodes.map(toOption));
}

export async function createGraphFixtureNode(
  organizationId: string,
  input: GraphFixtureCreateNode,
): Promise<GraphFixtureMutationResult> {
  await wait();
  const dataset = datasetFor(organizationId);
  const created = markPending(
    node(
      nextId(dataset, 'node'),
      input.kind,
      input.title.trim(),
      'user_curated',
      { label: '사용자 정리', href: null },
    ),
  );
  dataset.nodes.push(created);
  return { id: created.id, revision: created.revision, projection: 'pending' };
}

export async function updateGraphFixtureNode(
  organizationId: string,
  nodeId: string,
  input: GraphFixtureUpdateNode,
): Promise<GraphFixtureMutationResult> {
  await wait();
  const found = requireNode(datasetFor(organizationId), nodeId);
  requireRevision(found.revision, input.revision);
  found.kind = input.kind;
  found.title = input.title.trim();
  found.revision += 1;
  found.updatedAt = new Date().toISOString();
  markPending(found);
  return { id: found.id, revision: found.revision, projection: 'pending' };
}

export async function correctGraphFixtureNode(
  organizationId: string,
  nodeId: string,
  input: GraphFixtureCorrectNode,
): Promise<GraphFixtureMutationResult> {
  await wait();
  const found = requireNode(datasetFor(organizationId), nodeId);
  requireRevision(found.revision, input.revision);
  found.kind = input.kind;
  found.title = input.title.trim();
  found.revision += 1;
  found.updatedAt = new Date().toISOString();
  found.properties = { ...found.properties, 보정: '사용자 정정' };
  markPending(found);
  return { id: found.id, revision: found.revision, projection: 'pending' };
}

export async function deleteGraphFixtureNode(
  organizationId: string,
  nodeId: string,
  revision: number,
): Promise<void> {
  await wait();
  const dataset = datasetFor(organizationId);
  const found = requireNode(dataset, nodeId);
  requireRevision(found.revision, revision);
  const curatedCount = connectedEdges(dataset, nodeId).filter(
    ({ factClass }) => factClass === 'user_curated',
  ).length;
  if (found.factClass === 'user_curated' && curatedCount > 0) {
    throw problem(
      409,
      '연결된 관계가 있습니다',
      `연결된 사용자 관계 ${curatedCount}개를 먼저 삭제해 주세요.`,
      'graph_node_has_edges',
    );
  }
  dataset.nodes = dataset.nodes.filter(({ id }) => id !== nodeId);
  // 숨긴 AI 추출 노드의 추출 관계도 함께 숨긴다.
  dataset.edges = dataset.edges.filter(
    ({ sourceNodeId, targetNodeId }) =>
      sourceNodeId !== nodeId && targetNodeId !== nodeId,
  );
}

export async function createGraphFixtureEdge(
  organizationId: string,
  input: GraphFixtureCreateEdge,
): Promise<GraphFixtureMutationResult> {
  await wait();
  const dataset = datasetFor(organizationId);
  validateEdgeInput(dataset, input);
  const created = markPending(
    edge(
      nextId(dataset, 'edge'),
      input.sourceNodeId,
      input.predicate,
      input.targetNodeId,
      'user_curated',
      { directed: input.directed },
    ),
  );
  dataset.edges.push(created);
  return { id: created.id, revision: created.revision, projection: 'pending' };
}

export async function updateGraphFixtureEdge(
  organizationId: string,
  edgeId: string,
  input: GraphFixtureUpdateEdge,
): Promise<GraphFixtureMutationResult> {
  await wait();
  const dataset = datasetFor(organizationId);
  const found = requireEdge(dataset, edgeId);
  requireRevision(found.revision, input.revision);
  validateEdgeInput(dataset, input, edgeId);
  found.sourceNodeId = input.sourceNodeId;
  found.targetNodeId = input.targetNodeId;
  found.predicate = input.predicate;
  found.directed = input.directed;
  found.revision += 1;
  found.updatedAt = new Date().toISOString();
  markPending(found);
  return { id: found.id, revision: found.revision, projection: 'pending' };
}

export async function deleteGraphFixtureEdge(
  organizationId: string,
  edgeId: string,
  revision: number,
): Promise<void> {
  await wait();
  const dataset = datasetFor(organizationId);
  requireRevision(requireEdge(dataset, edgeId).revision, revision);
  dataset.edges = dataset.edges.filter(({ id }) => id !== edgeId);
}

export async function fetchGraphFixtureWikiIndex(
  organizationId: string,
  documentId: string,
  signal?: AbortSignal,
): Promise<GraphFixtureWikiIndex> {
  await wait(signal);
  const requestedAt =
    datasetFor(organizationId).wikiIndex.get(documentId)?.requestedAt ?? null;
  if (requestedAt === null) {
    return {
      documentId,
      status: 'up_to_date',
      requestedAt: null,
      completedAt: FIXTURE_UPDATED_AT,
    };
  }
  const elapsed = Date.now() - requestedAt;
  return {
    documentId,
    status:
      elapsed < 1500 ? 'accepted' : elapsed < 4000 ? 'running' : 'up_to_date',
    requestedAt: new Date(requestedAt).toISOString(),
    completedAt:
      elapsed < 4000 ? null : new Date(requestedAt + 4000).toISOString(),
  };
}

export async function requestGraphFixtureWikiRefresh(
  organizationId: string,
  documentId: string,
): Promise<{ status: 'accepted'; acceptedAt: string }> {
  await wait();
  const acceptedAt = Date.now();
  datasetFor(organizationId).wikiIndex.set(documentId, {
    requestedAt: acceptedAt,
  });
  return { status: 'accepted', acceptedAt: new Date(acceptedAt).toISOString() };
}
