import type { AgentActor } from '@/agent/domain/agent-actor';
import type { McpCredentialProvider } from '@/agent/infrastructure/mcp/mcp-credential.provider';
import { TeamspaceMcpAuthProviderFactory } from '@/agent/infrastructure/mcp/teamspace-mcp-auth-provider.factory';

import type { AuthProvider } from '@modelcontextprotocol/client';

export class CredentialBackedTeamspaceMcpAuthProviderFactory extends TeamspaceMcpAuthProviderFactory {
  constructor(private readonly credentials: McpCredentialProvider) {
    super();
  }

  async create(actor: AgentActor): Promise<AuthProvider> {
    const credential = await this.credentials.getCredential(actor);
    const onUnauthorized = credential.onUnauthorized;

    return {
      token: async () => {
        const value = await credential.token();
        if (value.trim() === '') {
          throw new Error(
            'AI Teamspace MCP delegation credential token이 비어 있습니다.',
          );
        }
        return value;
      },
      ...(onUnauthorized
        ? { onUnauthorized: async () => onUnauthorized() }
        : {}),
    };
  }
}
