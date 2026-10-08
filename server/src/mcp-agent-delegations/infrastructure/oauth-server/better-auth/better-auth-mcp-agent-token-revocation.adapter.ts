import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { Auth } from '@/auth/auth';
import { authOptions } from '@/auth/auth-options';
import type { AllConfigType } from '@/config/config.type';
import { McpAgentTokenRevocationProvider } from '@/mcp-agent-delegations/infrastructure/oauth-server/mcp-agent-token-revocation.provider';

import { AuthService } from '@thallesp/nestjs-better-auth';
import { encodeBasicCredentials } from 'better-auth/oauth2';

/**
 * first-party Agent client는 `client_secret_basic`으로 등록돼 있으므로 RFC 7009 revocation도
 * Basic 인증으로 요청한다. Better Auth는 Basic header를 실제 Request에서만 읽기 때문에
 * server API 대신 Better Auth handler에 revocation 요청을 보낸다.
 */
@Injectable()
export class BetterAuthMcpAgentTokenRevocationAdapter extends McpAgentTokenRevocationProvider {
  constructor(
    private readonly authService: AuthService<Auth>,
    private readonly configService: ConfigService<AllConfigType>,
  ) {
    super();
  }

  async revokeRefreshToken(refreshToken: string): Promise<void> {
    const { clientId, clientSecret } = this.configService.getOrThrow('mcp', {
      infer: true,
    }).agentDelegation;
    const { baseUrl } = this.configService.getOrThrow('auth', { infer: true });

    const response = await this.authService.instance.handler(
      new Request(`${baseUrl}${authOptions.basePath}/oauth2/revoke`, {
        method: 'POST',
        headers: {
          Authorization: encodeBasicCredentials(clientId, clientSecret),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          token: refreshToken,
          token_type_hint: 'refresh_token',
        }),
      }),
    );
    if (!response.ok) {
      throw new Error(
        `Better Auth token revocation이 ${response.status}로 실패했습니다.`,
      );
    }
  }
}
