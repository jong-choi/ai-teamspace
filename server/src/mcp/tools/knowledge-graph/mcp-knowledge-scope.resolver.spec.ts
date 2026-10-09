import type { McpAuthContext } from '@/mcp/contracts/mcp-auth-context';
import { McpKnowledgeScopeResolver } from '@/mcp/tools/knowledge-graph/mcp-knowledge-scope.resolver';
import type { McpAccessService } from '@/mcp-access/mcp-access.service';

const baseAuth: McpAuthContext = {
  authMethod: 'oauth',
  credentialId: null,
  userId: 'user-a',
  clientId: 'client-a',
  scopes: ['wiki:read'],
  allowedOrganizationIds: null,
};

function createResolver(decisions: Record<string, boolean>) {
  const evaluate = jest.fn(async (input: { requiredScope: string }) => ({
    allowed: decisions[input.requiredScope] ?? false,
    reason: 'organization_policy',
  }));
  const service = { evaluate } as unknown as McpAccessService;
  return { resolver: new McpKnowledgeScopeResolver(service), evaluate };
}

describe('McpKnowledgeScopeResolver', () => {
  it('wiki:read gate만 있으면 위키·semantic·curated 종류만 허용한다', async () => {
    const { resolver, evaluate } = createResolver({});

    await expect(resolver.allowedNodeKinds(baseAuth, 'org-a')).resolves.toEqual(
      ['wiki_document', 'semantic_entity', 'curated_node'],
    );
    expect(evaluate).not.toHaveBeenCalled();
  });

  it('추가 read scope는 매 호출 evaluate 결과가 허용일 때만 종류를 추가한다', async () => {
    const { resolver, evaluate } = createResolver({
      'projects:read': true,
      'calendar:read': false,
      'organizations:read': true,
    });

    await expect(
      resolver.allowedNodeKinds(
        {
          ...baseAuth,
          scopes: [
            'wiki:read',
            'projects:read',
            'calendar:read',
            'organizations:read',
          ],
        },
        'org-a',
      ),
    ).resolves.toEqual([
      'wiki_document',
      'semantic_entity',
      'curated_node',
      'project',
      'ticket',
      'member',
    ]);

    expect(evaluate).toHaveBeenCalledTimes(3);
    expect(evaluate.mock.calls.map(([input]) => input.requiredScope)).toEqual([
      'projects:read',
      'calendar:read',
      'organizations:read',
    ]);
  });

  it('같은 actor라도 다음 호출의 정책 변경을 다시 반영한다', async () => {
    const { resolver, evaluate } = createResolver({});
    evaluate
      .mockResolvedValueOnce({ allowed: true, reason: 'allowed' })
      .mockResolvedValueOnce({ allowed: false, reason: 'user_policy' });
    const auth: McpAuthContext = {
      ...baseAuth,
      scopes: ['wiki:read', 'projects:read'],
    };

    await expect(resolver.allowedNodeKinds(auth, 'org-a')).resolves.toContain(
      'project',
    );
    await expect(
      resolver.allowedNodeKinds(auth, 'org-a'),
    ).resolves.not.toContain('project');
    expect(evaluate).toHaveBeenCalledTimes(2);
  });
});
