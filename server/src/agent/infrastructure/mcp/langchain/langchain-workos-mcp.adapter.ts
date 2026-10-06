import { Injectable } from '@nestjs/common';

import { AgentConfiguration } from '@/agent/config/agent-configuration';
import type { AgentActor } from '@/agent/domain/agent-actor';
import { McpToolApprovalPolicy } from '@/agent/infrastructure/mcp/langchain/mcp-tool-approval.policy';
import {
  type McpCredential,
  McpCredentialProvider,
} from '@/agent/infrastructure/mcp/mcp-credential.provider';
import {
  type WorkOsToolSession,
  WorkOsToolSessionProvider,
} from '@/agent/infrastructure/mcp/workos-tool-session.provider';

import { MCPAdapter } from '@langchain/mcp-adapters';

@Injectable()
export class LangChainWorkOsMcpAdapter extends WorkOsToolSessionProvider {
  constructor(
    private readonly credentials: McpCredentialProvider,
    private readonly configuration: AgentConfiguration,
    private readonly approvalPolicy: McpToolApprovalPolicy,
  ) {
    super();
  }

  async open(actor: AgentActor): Promise<WorkOsToolSession> {
    const credential = await this.credentials.getCredential(actor);
    const mcp = this.configuration.mcp;
    const adapter = new MCPAdapter({
      prefixToolNameWithServerName: false,
      defaultToolTimeout: mcp.toolTimeoutMs,
      servers: {
        workos: {
          transport: 'http',
          mode: 'modern',
          url: mcp.url,
          authProvider: toAuthProvider(credential),
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
      return {
        tools,
        readOnlyTools: this.approvalPolicy.readOnlyTools(tools),
        interruptOn: this.approvalPolicy.interruptOn(tools),
        close,
      };
    } catch (error) {
      await close();
      throw error;
    }
  }
}

function toAuthProvider(credential: McpCredential): McpCredential {
  const onUnauthorized = credential.onUnauthorized;
  return {
    token: async () => {
      const value = await credential.token();
      if (value.trim() === '') {
        throw new Error(
          'WorkOS MCP delegation credential token이 비어 있습니다.',
        );
      }
      return value;
    },
    ...(onUnauthorized ? { onUnauthorized: () => onUnauthorized() } : {}),
  };
}
