import { Injectable } from '@nestjs/common';

import type { McpAuthContext } from '@/mcp/contracts/mcp-auth-context';
import type { BoundMcpTool } from '@/mcp/tools/bound-mcp-tool';
import { CalendarMcpRegistrar } from '@/mcp/tools/calendar/calendar-mcp.registrar';
import { ChatMcpRegistrar } from '@/mcp/tools/chat/chat-mcp.registrar';
import { KnowledgeGraphMcpRegistrar } from '@/mcp/tools/knowledge-graph/knowledge-graph-mcp.registrar';
import { McpToolNotFoundError } from '@/mcp/tools/mcp-tool.error';
import { McpToolAuthorizationService } from '@/mcp/tools/mcp-tool-authorization.service';
import { OrganizationMcpRegistrar } from '@/mcp/tools/organizations/organization-mcp.registrar';
import { ProjectMcpRegistrar } from '@/mcp/tools/projects/project-mcp.registrar';
import { v1McpToolDefinitions } from '@/mcp/tools/v1-tool-manifest';
import { WikiMcpRegistrar } from '@/mcp/tools/wiki/wiki-mcp.registrar';

@Injectable()
export class McpToolRegistryService {
  private readonly tools: readonly BoundMcpTool[];
  private readonly toolsByName: ReadonlyMap<string, BoundMcpTool>;

  constructor(
    organizationRegistrar: OrganizationMcpRegistrar,
    chatRegistrar: ChatMcpRegistrar,
    wikiRegistrar: WikiMcpRegistrar,
    projectRegistrar: ProjectMcpRegistrar,
    calendarRegistrar: CalendarMcpRegistrar,
    knowledgeGraphRegistrar: KnowledgeGraphMcpRegistrar,
    private readonly authorizationService: McpToolAuthorizationService,
  ) {
    this.tools = [
      ...organizationRegistrar.tools(),
      ...chatRegistrar.tools(),
      ...wikiRegistrar.tools(),
      ...projectRegistrar.tools(),
      ...calendarRegistrar.tools(),
      ...knowledgeGraphRegistrar.tools(),
    ];

    const expectedNames = v1McpToolDefinitions.map(({ name }) => name);
    const actualNames = this.tools.map(({ definition }) => definition.name);
    if (
      actualNames.length !== expectedNames.length ||
      actualNames.some((name, index) => name !== expectedNames[index])
    ) {
      throw new Error(
        'MCP v1 registrar와 canonical manifest가 일치하지 않습니다.',
      );
    }

    this.toolsByName = new Map(
      this.tools.map((tool) => [tool.definition.name, tool]),
    );
  }

  toolsForAuth(auth: McpAuthContext): readonly BoundMcpTool[] {
    const scopes = new Set(auth.scopes);
    return this.tools.filter((tool) =>
      scopes.has(tool.definition.requiredScope),
    );
  }

  async invoke(
    toolName: string,
    rawInput: unknown,
    auth: McpAuthContext,
  ): Promise<Record<string, unknown>> {
    const tool = this.toolsByName.get(toolName);
    if (!tool) {
      throw new McpToolNotFoundError();
    }

    return tool.invoke(
      rawInput,
      auth,
      this.authorizationService.authorize.bind(this.authorizationService),
    );
  }
}
