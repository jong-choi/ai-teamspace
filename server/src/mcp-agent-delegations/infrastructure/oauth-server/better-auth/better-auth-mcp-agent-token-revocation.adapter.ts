import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { Auth } from '@/auth/auth';
import type { AllConfigType } from '@/config/config.type';
import { McpAgentTokenRevocationProvider } from '@/mcp-agent-delegations/infrastructure/oauth-server/mcp-agent-token-revocation.provider';

import { AuthService } from '@thallesp/nestjs-better-auth';

@Injectable()
export class BetterAuthMcpAgentTokenRevocationAdapter extends McpAgentTokenRevocationProvider {
  constructor(
    private readonly authService: AuthService<Auth>,
    private readonly configService: ConfigService<AllConfigType>,
  ) {
    super();
  }

  async revokeRefreshToken(refreshToken: string): Promise<void> {
    const config = this.configService.getOrThrow('mcp', { infer: true });

    await this.authService.api.oauth2Revoke({
      body: {
        client_id: config.agentDelegation.clientId,
        client_secret: config.agentDelegation.clientSecret,
        token: refreshToken,
        token_type_hint: 'refresh_token',
      },
    });
  }
}
