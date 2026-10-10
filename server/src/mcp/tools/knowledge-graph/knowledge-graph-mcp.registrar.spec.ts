import { encodeGraphNodeId } from '@/knowledge-graph/domain/graph-identity';
import type { McpAuthContext } from '@/mcp/contracts/mcp-auth-context';
import { KnowledgeGraphMcpRegistrar } from '@/mcp/tools/knowledge-graph/knowledge-graph-mcp.registrar';
import type { McpKnowledgeScopeResolver } from '@/mcp/tools/knowledge-graph/mcp-knowledge-scope.resolver';

const auth: McpAuthContext = {
  authMethod: 'oauth',
  credentialId: null,
  userId: 'user-a',
  clientId: 'client-a',
  scopes: ['wiki:read'],
  allowedOrganizationIds: null,
};

const authorize = jest.fn().mockResolvedValue(undefined);

describe('KnowledgeGraphMcpRegistrar', () => {
  const search = jest.fn().mockResolvedValue({
    mode: 'keyword',
    completeness: 'complete',
    semanticRecall: null,
    degradedReasons: [],
    items: [],
  });
  const explore = jest.fn().mockResolvedValue({
    nodes: [],
    edges: [],
    truncated: false,
    nextCursor: null,
    completeness: 'complete',
    degradedReasons: [],
  });
  const resolverAllowedNodeKindsMock = jest
    .fn()
    .mockResolvedValue(['wiki_document', 'semantic_entity', 'curated_node']);
  const resolver = {
    allowedNodeKinds: resolverAllowedNodeKindsMock,
  } as unknown as McpKnowledgeScopeResolver;
  const list = jest.fn().mockResolvedValue({ items: [] });
  const registrar = new KnowledgeGraphMcpRegistrar(
    { search } as never,
    { explore } as never,
    resolver,
    { list } as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('knowledge_search는 scope resolver 결과를 검색 서비스 trusted 인자로 전달한다', async () => {
    const [tool] = registrar.tools();

    await expect(
      tool!.invoke(
        { organizationId: 'org-a', q: '검색어', mode: 'keyword', limit: 3 },
        auth,
        authorize,
      ),
    ).resolves.toMatchObject({ mode: 'keyword', items: [], records: [] });

    expect(resolverAllowedNodeKindsMock).toHaveBeenCalledWith(auth, 'org-a');
    expect(search).toHaveBeenCalledWith(
      { userId: 'user-a' },
      'org-a',
      { q: '검색어', mode: 'keyword', limit: 3 },
      ['wiki_document', 'semantic_entity', 'curated_node'],
      { longExcerpt: true },
    );
    // 업무 원본 read scope가 없으면 제목 일치 조회를 하지 않는다.
    expect(list).not.toHaveBeenCalled();
  });

  it('knowledge_search는 문서마다 추출 관계를 붙이고 허용된 업무 원본만 제목으로 찾는다', async () => {
    const documentNodeId = 'doc-node';
    search.mockResolvedValueOnce({
      mode: 'hybrid',
      completeness: 'complete',
      semanticRecall: 'exact',
      degradedReasons: [],
      items: [
        {
          fusedRank: 1,
          source: {
            kind: 'wiki_document',
            id: '4b3e91f8-c6b0-4a00-b174-b05e42e51f1e',
            nodeId: documentNodeId,
            title: '리뉴얼 기획서',
            updatedAt: '2026-09-10T04:15:00.000Z',
          },
          matchedBy: ['keyword'],
          semantic: null,
          keyword: { matchedIn: ['title'] },
          excerpt: '가'.repeat(1200),
        },
      ],
    });
    explore.mockResolvedValueOnce({
      nodes: [
        { id: 'e1', kind: 'semantic_entity', title: '최유진' },
        { id: 'e2', kind: 'semantic_entity', title: '홈' },
        { id: documentNodeId, kind: 'wiki_document', title: '리뉴얼 기획서' },
      ],
      edges: [
        {
          relation: 'mentions',
          sourceNodeId: documentNodeId,
          targetNodeId: 'e1',
          directed: true,
          predicate: null,
        },
        {
          relation: 'semantic',
          sourceNodeId: 'e1',
          targetNodeId: 'e2',
          directed: true,
          predicate: 'RESPONSIBLE_FOR',
        },
      ],
      truncated: false,
      nextCursor: null,
      completeness: 'complete',
      degradedReasons: [],
    });
    resolverAllowedNodeKindsMock.mockResolvedValueOnce([
      'wiki_document',
      'semantic_entity',
      'curated_node',
      'project',
      'ticket',
    ]);
    list.mockResolvedValueOnce({
      items: [
        {
          id: 'project-node',
          kind: 'project',
          title: '귤밭 앱 리뉴얼',
          sourceRef: { id: 'project-1' },
        },
      ],
    });
    const [tool] = registrar.tools();

    const output = await tool!.invoke(
      { organizationId: 'org-a', q: '리뉴얼', limit: 3 },
      auth,
      authorize,
    );

    expect(output).toMatchObject({
      items: [{ relations: ['최유진 -[RESPONSIBLE_FOR]-> 홈'] }],
      records: [
        {
          kind: 'project',
          nodeId: 'project-node',
          sourceId: 'project-1',
          title: '귤밭 앱 리뉴얼',
        },
      ],
    });
    expect(list).toHaveBeenCalledWith(
      { userId: 'user-a' },
      'org-a',
      { q: '리뉴얼', limit: 10 },
      ['project', 'ticket'],
    );
  });

  it('knowledge_get_context는 원본 ID로 받은 focus를 graph node ID로 바꿔 조회한다', async () => {
    const [, tool] = registrar.tools();
    const documentId = '4b3e91f8-c6b0-4a00-b174-b05e42e51f1e';

    await tool!.invoke(
      {
        organizationId: 'org-a',
        focusKind: 'wiki_document',
        focusId: documentId,
      },
      auth,
      authorize,
    );

    expect(explore).toHaveBeenCalledWith(
      { userId: 'user-a' },
      'org-a',
      {
        focusKind: 'wiki_document',
        focusId: encodeGraphNodeId([1, 's', 'wiki_document', documentId]),
        depth: 1,
        limit: 50,
      },
      ['wiki_document', 'semantic_entity', 'curated_node'],
    );
  });

  it('knowledge_get_context는 조직 ID를 제외한 focus 입력만 explore에 전달한다', async () => {
    const [, tool] = registrar.tools();

    await expect(
      tool!.invoke(
        {
          organizationId: 'org-a',
          focusKind: 'wiki_document',
          focusId: 'node-a',
          depth: 2,
        },
        auth,
        authorize,
      ),
    ).resolves.toEqual({
      nodes: [],
      entities: [],
      relations: [],
      truncated: false,
      completeness: 'complete',
      degradedReasons: [],
    });

    expect(explore).toHaveBeenCalledWith(
      { userId: 'user-a' },
      'org-a',
      { focusKind: 'wiki_document', focusId: 'node-a', depth: 2, limit: 50 },
      ['wiki_document', 'semantic_entity', 'curated_node'],
    );
  });

  it('MCP authorization이 거부되면 scope resolver와 검색 서비스를 호출하지 않는다', async () => {
    const [tool] = registrar.tools();
    const denied = jest
      .fn()
      .mockRejectedValue(new Error('MCP authorization denied'));

    await expect(
      tool!.invoke(
        { organizationId: 'org-a', q: '검색어', mode: 'keyword', limit: 3 },
        auth,
        denied,
      ),
    ).rejects.toThrow('MCP authorization denied');

    expect(denied).toHaveBeenCalledTimes(1);
    expect(resolverAllowedNodeKindsMock).not.toHaveBeenCalled();
    expect(search).not.toHaveBeenCalled();
  });

  it('raw Cypher 같은 계약 밖 필드는 도구 입력 단계에서 거부한다', async () => {
    const [tool] = registrar.tools();

    await expect(
      tool!.invoke(
        { organizationId: 'org-a', q: '검색어', cypher: 'MATCH (n) RETURN n' },
        auth,
        authorize,
      ),
    ).rejects.toThrow();
    expect(search).not.toHaveBeenCalled();
  });
});
