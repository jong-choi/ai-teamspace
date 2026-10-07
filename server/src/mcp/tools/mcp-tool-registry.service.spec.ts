import type { McpAuthContext } from '@/mcp/contracts/mcp-auth-context';
import type { BoundMcpTool } from '@/mcp/tools/bound-mcp-tool';
import type { McpToolAuthorizationService } from '@/mcp/tools/mcp-tool-authorization.service';
import type { McpToolDefinition } from '@/mcp/tools/mcp-tool-definition';
import { McpToolRegistryService } from '@/mcp/tools/mcp-tool-registry.service';
import { v1McpToolDefinitions } from '@/mcp/tools/v1-tool-manifest';

function registrar(tools: readonly BoundMcpTool[]) {
  return { tools: () => [...tools] };
}

function boundTool(definition: McpToolDefinition): BoundMcpTool {
  return {
    definition,
    invoke: jest.fn().mockResolvedValue({ ok: true }),
  };
}

const auth: McpAuthContext = {
  authMethod: 'oauth',
  credentialId: null,
  userId: 'user-a',
  clientId: 'client-a',
  scopes: [
    'organizations:read',
    'chat:read',
    'wiki:read',
    'projects:read',
    'calendar:read',
  ],
  allowedOrganizationIds: null,
};

describe('MCP tool registry', () => {
  const allTools = v1McpToolDefinitions.map((definition) =>
    boundTool(definition),
  );
  const authorizationService = {
    authorize: jest.fn().mockResolvedValue(undefined),
  } as unknown as McpToolAuthorizationService;

  const registry = new McpToolRegistryService(
    registrar(allTools.slice(0, 3)) as never,
    registrar(allTools.slice(3, 6)) as never,
    registrar(allTools.slice(6, 10)) as never,
    registrar(allTools.slice(10, 16)) as never,
    registrar(allTools.slice(16, 23)) as never,
    authorizationService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('canonical manifest와 동일한 23개 registrar 순서를 요구한다', () => {
    expect(
      registry.toolsForAuth({
        ...auth,
        scopes: [
          'organizations:read',
          'organizations:write',
          'chat:read',
          'chat:write',
          'wiki:read',
          'wiki:write',
          'projects:read',
          'projects:write',
          'calendar:read',
          'calendar:write',
        ],
      }),
    ).toHaveLength(23);
  });

  it('credential scope가 없는 tool은 discovery surface에서 제외한다', () => {
    expect(
      registry.toolsForAuth(auth).map(({ definition }) => definition.name),
    ).toEqual([
      'organizations_list',
      'organization_members_list',
      'chat_conversations_list',
      'chat_messages_list',
      'wiki_search',
      'wiki_document_get',
      'projects_list',
      'project_get',
      'project_ticket_get',
      'calendar_meetings_list',
      'calendar_meeting_get',
      'calendar_availability_check',
    ]);
  });

  it('direct invocation은 bound tool을 통해 live authorization을 다시 수행한다', async () => {
    const tool = allTools[1]!;
    const invoke = jest.spyOn(tool, 'invoke');

    await expect(
      registry.invoke(tool.definition.name, { organizationId: 'org-a' }, auth),
    ).resolves.toEqual({ ok: true });

    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke.mock.calls[0]?.[2]).toEqual(expect.any(Function));
  });

  it('등록되지 않은 tool 이름은 fail-closed한다', async () => {
    await expect(
      registry.invoke('unknown_tool', {}, auth),
    ).rejects.toMatchObject({ code: 'MCP_TOOL_NOT_FOUND' });
  });
});
