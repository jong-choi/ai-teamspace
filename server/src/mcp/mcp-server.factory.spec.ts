import type { AuthInfo } from '@modelcontextprotocol/server';

import { WorkOsMcpServerFactory } from '@/mcp/mcp-server.factory';
import type { BoundMcpTool } from '@/mcp/tools/bound-mcp-tool';
import { organizationsListTool } from '@/mcp/tools/organizations/organization-tool-definitions';
import type { McpToolRegistryService } from '@/mcp/tools/mcp-tool-registry.service';

const context = {
  authMethod: 'oauth' as const,
  credentialId: 'token-a',
  userId: 'user-a',
  clientId: 'client-a',
  scopes: ['organizations:read' as const],
  allowedOrganizationIds: null,
};

const authInfo: AuthInfo = {
  token: 'raw-transport-token',
  clientId: 'client-a',
  scopes: ['organizations:read'],
  extra: { mcpAuthContext: context },
};

describe('Work OS MCP server factory', () => {
  it('요청마다 새 McpServer를 만들고 현재 credential에 허용된 tool만 등록한다', () => {
    const tools: BoundMcpTool[] = [
      {
        definition: organizationsListTool,
        invoke: jest.fn(),
      },
    ];
    const toolsForAuth = jest.fn().mockReturnValue(tools);
    const registry = {
      toolsForAuth,
      invoke: jest.fn(),
    } as unknown as McpToolRegistryService;
    const factory = new WorkOsMcpServerFactory(registry);

    const first = factory.create(authInfo);
    const second = factory.create(authInfo);

    expect(first).not.toBe(second);
    expect(toolsForAuth).toHaveBeenCalledWith(context);
    expect(first.toolInputSchemaJson('organizations_list')).toMatchObject({
      type: 'object',
    });
    expect(first.toolInputSchemaJson('wiki_search')).toBeUndefined();
  });

  it('raw transport token을 tool registry context로 전달하지 않는다', () => {
    const registry = {
      toolsForAuth: jest.fn().mockImplementation((auth) => {
        expect(JSON.stringify(auth)).not.toContain('raw-transport-token');
        return [];
      }),
      invoke: jest.fn(),
    } as unknown as McpToolRegistryService;

    new WorkOsMcpServerFactory(registry).create(authInfo);

    expect(registry.toolsForAuth).toHaveBeenCalledTimes(1);
  });
});
