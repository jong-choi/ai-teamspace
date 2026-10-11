import { AgentConfiguration } from '@/agent/config/agent-configuration';
import type { AgentActor } from '@/agent/domain/agent-actor';
import { McpToolApprovalPolicy } from '@/agent/infrastructure/mcp/langchain/mcp-tool-approval.policy';
import { TeamspaceMcpAuthProviderFactory } from '@/agent/infrastructure/mcp/teamspace-mcp-auth-provider.factory';
import {
  type McpToolIdentity,
  type TeamspaceToolSession,
  TeamspaceToolSessionProvider,
} from '@/agent/infrastructure/mcp/teamspace-tool-session.provider';

import { MCPAdapter } from '@langchain/mcp-adapters';

/**
 * protocol-only fixture MCP 서버를 HTTP로 붙이는 테스트 전용 세션 provider.
 * production built-in 경로는 서버 내부 연결(`FirstPartyTeamspaceMcpAdapter`)을 사용한다.
 */
export class HttpTeamspaceMcpSessionProvider extends TeamspaceToolSessionProvider {
  constructor(
    private readonly authProviders: TeamspaceMcpAuthProviderFactory,
    private readonly configuration: AgentConfiguration,
    private readonly approvalPolicy: McpToolApprovalPolicy,
  ) {
    super();
  }

  async open(actor: AgentActor): Promise<TeamspaceToolSession> {
    const authProvider = await this.authProviders.create(actor);
    const mcp = this.configuration.mcp;
    const adapter = new MCPAdapter({
      prefixToolNameWithServerName: false,
      defaultToolTimeout: mcp.toolTimeoutMs,
      servers: {
        workos: {
          transport: 'http',
          mode: 'modern',
          url: mcp.url,
          authProvider,
        },
      },
    });

    let closePromise: Promise<void> | undefined;
    const close = (): Promise<void> => {
      closePromise ??= adapter.close();
      return closePromise;
    };

    try {
      const tools = await adapter.listTools('workos');
      const toolIdentities = new Map<string, McpToolIdentity>();
      for (const tool of tools) {
        toolIdentities.set(tool.name, {
          source: 'workos',
          namespace: 'workos',
          originalToolName: tool.name,
        });
      }

      return {
        tools,
        readOnlyTools: this.approvalPolicy.readOnlyTools(tools),
        interruptOn: this.approvalPolicy.interruptOn(tools),
        toolIdentities,
        close,
      };
    } catch (error) {
      await close();
      throw error;
    }
  }
}
