import { Injectable } from '@nestjs/common';

import { ApplicationError } from '@/application.error';
import type { McpAuthContext } from '@/mcp/contracts/mcp-auth-context';
import { getMcpAuthContext } from '@/mcp/infrastructure/auth/better-auth/better-auth-mcp-auth.mapper';
import { McpToolRegistryService } from '@/mcp/tools/mcp-tool-registry.service';

import {
  type AuthInfo,
  McpServer,
  requireScopes,
} from '@modelcontextprotocol/server';

export const TEAMSPACE_MCP_SERVER_INFO = {
  name: 'teamspace',
  version: '0.0.1',
} as const;

@Injectable()
export class TeamspaceMcpServerFactory {
  constructor(private readonly toolRegistry: McpToolRegistryService) {}

  create(authInfo: AuthInfo): McpServer {
    return this.createForAuthContext(getMcpAuthContext(authInfo));
  }

  /** 서버가 이미 검증한 auth context로 MCP 서버를 만든다. 내부 built-in Agent 연결이 사용한다. */
  createForAuthContext(auth: McpAuthContext): McpServer {
    const server = new McpServer(TEAMSPACE_MCP_SERVER_INFO);

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
          try {
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
          } catch (error) {
            const failure =
              error instanceof ApplicationError
                ? { errorCode: error.code, message: error.message }
                : {
                    errorCode: 'INTERNAL_ERROR',
                    message: 'MCP 도구 실행 중 오류가 발생했습니다.',
                  };
            return {
              content: [
                {
                  type: 'text' as const,
                  text: JSON.stringify(failure),
                },
              ],
              isError: true,
            };
          }
        },
      );
    }

    return server;
  }
}
