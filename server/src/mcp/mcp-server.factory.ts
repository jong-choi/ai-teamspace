import { Injectable } from '@nestjs/common';

import type { McpAuthContext } from '@/mcp/contracts/mcp-auth-context';
import { getMcpAuthContext } from '@/mcp/infrastructure/auth/better-auth/better-auth-mcp-auth.mapper';
import { McpToolRegistryService } from '@/mcp/tools/mcp-tool-registry.service';

import {
  type AuthInfo,
  McpServer,
  requireScopes,
} from '@modelcontextprotocol/server';

export const WORK_OS_MCP_SERVER_INFO = {
  name: 'work-os',
  version: '0.0.1',
} as const;

@Injectable()
export class WorkOsMcpServerFactory {
  constructor(private readonly toolRegistry: McpToolRegistryService) {}

  create(authInfo: AuthInfo): McpServer {
    return this.createForAuthContext(getMcpAuthContext(authInfo));
  }

  /** 서버가 이미 검증한 auth context로 MCP 서버를 만든다. 내부 built-in Agent 연결이 사용한다. */
  createForAuthContext(auth: McpAuthContext): McpServer {
    const server = new McpServer(WORK_OS_MCP_SERVER_INFO);

    for (const tool of this.toolRegistry.toolsForAuth(auth)) {
      const { definition } = tool;

      server.registerTool(
        definition.name,
        {
          title: definition.title,
          description: definition.description,
          inputSchema: definition.inputSchema,
          outputSchema: definition.outputSchema,
          annotations: definition.annotations,
          scopeChallenge: requireScopes(definition.requiredScope),
        },
        async (input) => {
          const output = await this.toolRegistry.invoke(
            definition.name,
            input,
            auth,
          );

          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify(output),
              },
            ],
            structuredContent: output,
          };
        },
      );
    }

    return server;
  }
}
