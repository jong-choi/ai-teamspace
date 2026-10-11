import type { McpAuthContext } from '@/mcp/contracts/mcp-auth-context';
import type { BoundMcpTool } from '@/mcp/tools/bound-mcp-tool';
import { calendarToolDefinitions } from '@/mcp/tools/calendar/calendar-tool-definitions';
import { chatToolDefinitions } from '@/mcp/tools/chat/chat-tool-definitions';
import { knowledgeGraphToolDefinitions } from '@/mcp/tools/knowledge-graph/knowledge-graph-tool-definitions';
import type { McpToolAuthorizationService } from '@/mcp/tools/mcp-tool-authorization.service';
import type { McpToolDefinition } from '@/mcp/tools/mcp-tool-definition';
import { McpToolRegistryService } from '@/mcp/tools/mcp-tool-registry.service';
import { organizationToolDefinitions } from '@/mcp/tools/organizations/organization-tool-definitions';
import { projectToolDefinitions } from '@/mcp/tools/projects/project-tool-definitions';
import { v1McpToolDefinitions } from '@/mcp/tools/v1-tool-manifest';
import { wikiToolDefinitions } from '@/mcp/tools/wiki/wiki-tool-definitions';

function registrar(definitions: readonly McpToolDefinition[]) {
  const tools: BoundMcpTool[] = definitions.map((definition) =>
    boundTool(definition),
  );
  return { tools: () => tools };
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
  const registrars = [
    registrar(organizationToolDefinitions),
    registrar(chatToolDefinitions),
    registrar(wikiToolDefinitions),
    registrar(projectToolDefinitions),
    registrar(calendarToolDefinitions),
    registrar(knowledgeGraphToolDefinitions),
  ] as const;
  const allTools = registrars.flatMap((item) => item.tools());
  const authorizationService = {
    authorize: jest.fn().mockResolvedValue(undefined),
  } as unknown as McpToolAuthorizationService;

  const registry = new McpToolRegistryService(
    registrars[0] as never,
    registrars[1] as never,
    registrars[2] as never,
    registrars[3] as never,
    registrars[4] as never,
    registrars[5] as never,
    authorizationService,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('모든 scope가 있으면 canonical manifest 전체를 같은 순서로 노출한다', () => {
    expect(
      registry
        .toolsForAuth({
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
        })
        .map(({ definition }) => definition.name),
    ).toEqual(v1McpToolDefinitions.map(({ name }) => name));
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
      'project_columns_list',
      'project_ticket_get',
      'calendar_meetings_list',
      'calendar_meeting_get',
      'calendar_availability_check',
      'calendar_rooms_list',
      'knowledge_search',
      'knowledge_get_context',
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
