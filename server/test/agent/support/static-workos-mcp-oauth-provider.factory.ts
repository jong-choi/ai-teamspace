import type { AgentActor } from '@/agent/domain/agent-actor';
import { WorkOsMcpAuthProviderFactory } from '@/agent/infrastructure/mcp/workos-mcp-auth-provider.factory';

import type {
  OAuthClientMetadata,
  OAuthClientProvider,
  StoredOAuthClientInformation,
  StoredOAuthTokens,
} from '@modelcontextprotocol/client';

/** 실제 MCP OAuthClientProvider transport 경로를 검증하는 test-only provider다. */
export class StaticWorkOsMcpOAuthProviderFactory extends WorkOsMcpAuthProviderFactory {
  create(actor: AgentActor): OAuthClientProvider {
    return new StaticOAuthClientProvider(`fixture:${actor.userId}`);
  }
}

class StaticOAuthClientProvider implements OAuthClientProvider {
  readonly redirectUrl = 'http://127.0.0.1/agent/mcp/oauth/test-callback';

  readonly clientMetadata: OAuthClientMetadata = {
    client_name: 'Work OS Agent OAuth fixture',
    redirect_uris: [this.redirectUrl],
  };

  private storedTokens: StoredOAuthTokens;
  private verifier: string | undefined;

  constructor(accessToken: string) {
    this.storedTokens = {
      access_token: accessToken,
      token_type: 'Bearer',
    };
  }

  clientInformation(): StoredOAuthClientInformation | undefined {
    return undefined;
  }

  tokens(): StoredOAuthTokens {
    return this.storedTokens;
  }

  saveTokens(tokens: StoredOAuthTokens): void {
    this.storedTokens = tokens;
  }

  redirectToAuthorization(): never {
    throw new Error(
      'test OAuth provider에서 authorization redirect는 예상하지 않습니다.',
    );
  }

  saveCodeVerifier(codeVerifier: string): void {
    this.verifier = codeVerifier;
  }

  codeVerifier(): string {
    if (!this.verifier) {
      throw new Error('test OAuth provider에 PKCE verifier가 없습니다.');
    }
    return this.verifier;
  }
}
