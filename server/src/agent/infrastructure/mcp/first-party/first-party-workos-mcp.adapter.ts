import { Injectable } from '@nestjs/common';

import { AgentConfiguration } from '@/agent/config/agent-configuration';
import type { AgentActor } from '@/agent/domain/agent-actor';
import { McpToolApprovalPolicy } from '@/agent/infrastructure/mcp/langchain/mcp-tool-approval.policy';
import {
  type McpToolIdentity,
  type WorkOsToolSession,
  WorkOsToolSessionProvider,
} from '@/agent/infrastructure/mcp/workos-tool-session.provider';
import { McpFirstPartyConnectionService } from '@/mcp/mcp-first-party-connection.service';

import { loadMcpTools } from '@langchain/mcp-adapters';

const WORK_OS_SERVER_NAME = 'workos';

/**
 * built-in Work OS 도구를 서버 내부 MCP 연결로 연다.
 * 별도 OAuth 위임 없이 검증된 actor의 현재 조직 권한으로 도구를 노출한다.
 */
@Injectable()
export class FirstPartyWorkOsMcpAdapter extends WorkOsToolSessionProvider {
  constructor(
    private readonly connections: McpFirstPartyConnectionService,
    private readonly configuration: AgentConfiguration,
    private readonly approvalPolicy: McpToolApprovalPolicy,
  ) {
    super();
  }

  async open(actor: AgentActor): Promise<WorkOsToolSession> {
    const connection = await this.connections.connect({
      userId: actor.userId,
      organizationId: actor.organizationId,
    });

    try {
      const tools = await loadMcpTools(WORK_OS_SERVER_NAME, connection.client, {
        prefixToolNameWithServerName: false,
        defaultToolTimeout: this.configuration.mcp.toolTimeoutMs,
      });
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
        close: () => connection.close(),
      };
    } catch (error) {
      await connection.close();
      throw error;
    }
  }
}
