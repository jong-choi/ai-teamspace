import { Injectable } from '@nestjs/common';

import {
  McpServer,
  requireScopes,
  type AuthInfo,
} from '@modelcontextprotocol/server';

import { getMcpAuthContext } from '@/mcp/infrastructure/auth/better-auth/better-auth-mcp-auth.mapper';
import { McpToolRegistryService } from '@/mcp/tools/mcp-tool-registry.service';

export const WORK_OS_MCP_SERVER_INFO = {
  name: 'work-os',
  version: '0.0.1',
} as const;

@Injectable()
export class WorkOsMcpServerFactory {
  constructor(private readonly toolRegistry: McpToolRegistryService) {}

  create(authInfo: AuthInfo): McpServer {
    const auth = getMcpAuthContext(authInfo);
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
