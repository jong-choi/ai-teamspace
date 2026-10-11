import { Injectable } from '@nestjs/common';

import { AgentConfiguration } from '@/agent/config/agent-configuration';
import type { AgentActor } from '@/agent/domain/agent-actor';
import { McpToolApprovalPolicy } from '@/agent/infrastructure/mcp/langchain/mcp-tool-approval.policy';
import {
  type McpToolIdentity,
  type TeamspaceToolSession,
  TeamspaceToolSessionProvider,
} from '@/agent/infrastructure/mcp/teamspace-tool-session.provider';
import { McpFirstPartyConnectionService } from '@/mcp/mcp-first-party-connection.service';

import { loadMcpTools } from '@langchain/mcp-adapters';

const TEAMSPACE_SERVER_NAME = 'teamspace';

/**
 * built-in AI Teamspace 도구를 서버 내부 MCP 연결로 연다.
 * 별도 OAuth 위임 없이 검증된 actor의 현재 조직 권한으로 도구를 노출한다.
 */
@Injectable()
export class FirstPartyTeamspaceMcpAdapter extends TeamspaceToolSessionProvider {
  constructor(
    private readonly connections: McpFirstPartyConnectionService,
    private readonly configuration: AgentConfiguration,
    private readonly approvalPolicy: McpToolApprovalPolicy,
  ) {
    super();
  }

  async open(actor: AgentActor): Promise<TeamspaceToolSession> {
    const connection = await this.connections.connect({
      userId: actor.userId,
      organizationId: actor.organizationId,
    });

    try {
      const tools = await loadMcpTools(
        TEAMSPACE_SERVER_NAME,
        connection.client,
        {
          prefixToolNameWithServerName: false,
          defaultToolTimeout: this.configuration.mcp.toolTimeoutMs,
        },
      );
      const toolIdentities = new Map<string, McpToolIdentity>();
      for (const tool of tools) {
        toolIdentities.set(tool.name, {
          source: 'teamspace',
          namespace: 'teamspace',
          originalToolName: tool.name,
        });
      }

      return {
        tools,
        readOnlyTools: this.approvalPolicy.readOnlyTools(tools),
        interruptOn: this.approvalPolicy.interruptOn(tools),
        toolIdentities,
        close: () => connection.close(),
      };
    } catch (error) {
      await connection.close();
      throw error;
    }
  }
}
