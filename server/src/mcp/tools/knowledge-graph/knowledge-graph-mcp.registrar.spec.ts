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
  const registrar = new KnowledgeGraphMcpRegistrar(
    { search } as never,
    { explore } as never,
    resolver,
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
    ).resolves.toMatchObject({ mode: 'keyword', items: [] });

    expect(resolverAllowedNodeKindsMock).toHaveBeenCalledWith(auth, 'org-a');
    expect(search).toHaveBeenCalledWith(
      { userId: 'user-a' },
      'org-a',
      { q: '검색어', mode: 'keyword', limit: 3 },
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
    ).resolves.toMatchObject({ nodes: [], edges: [] });

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
