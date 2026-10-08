import type { McpConfig } from '@/mcp/config/mcp-config.type';
import { MCP_SCOPES } from '@/mcp/contracts/mcp-scope';
import type { McpAgentOauthFlow } from '@/mcp-agent-delegations/domain/mcp-agent-oauth-flow';
import {
  McpAgentDelegationCredentialInvalidError,
  McpAgentDelegationFlowInvalidError,
  McpAgentDelegationRequiredError,
} from '@/mcp-agent-delegations/mcp-agent-delegation.error';
import type { McpAgentRefreshLease } from '@/mcp-agent-delegations/mcp-agent-delegation-credential.service';
import { McpAgentDelegationCredentialService } from '@/mcp-agent-delegations/mcp-agent-delegation-credential.service';
import type {
  McpAgentDelegationActor,
  McpAgentOauthFlowStore,
} from '@/mcp-agent-delegations/mcp-agent-oauth-flow.service';

import type {
  OAuthClientInformationContext,
  OAuthClientMetadata,
  OAuthClientProvider,
  OAuthDiscoveryState,
  StoredOAuthClientInformation,
  StoredOAuthTokens,
} from '@modelcontextprotocol/client';

export type McpAgentDelegationRedirectMode = 'capture' | 'reject';

export class McpAgentDelegationOAuthClientProvider implements OAuthClientProvider {
  private capturedAuthorizationUrl?: URL;
  private resolvedIssuer?: string;

  constructor(
    private readonly actor: McpAgentDelegationActor,
    private readonly config: McpConfig,
    private readonly credentials: McpAgentDelegationCredentialService,
    private readonly flowStore: McpAgentOauthFlowStore,
    private readonly redirectMode: McpAgentDelegationRedirectMode,
    private readonly flow?: McpAgentOauthFlow,
    private readonly rawState?: string,
    private readonly refreshLease?: McpAgentRefreshLease,
  ) {
    this.resolvedIssuer = flow?.issuer
      ? normalizeOAuthIssuer(flow.issuer)
      : undefined;
  }

  get redirectUrl(): string {
    return this.config.agentDelegation.redirectUrl;
  }

  get clientMetadata(): OAuthClientMetadata {
    return {
      redirect_uris: [this.redirectUrl],
      token_endpoint_auth_method: 'client_secret_basic',
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      client_name: 'Work OS Agent',
      software_id: 'work-os-agent',
      scope: MCP_SCOPES.join(' '),
    };
  }

  clientInformation(
    context?: OAuthClientInformationContext,
  ): StoredOAuthClientInformation {
    if (!context?.issuer) {
      throw new McpAgentDelegationCredentialInvalidError();
    }
    this.assertIssuer(context.issuer);

    return {
      client_id: this.config.agentDelegation.clientId,
      client_secret: this.config.agentDelegation.clientSecret,
      client_id_issued_at: 0,
      client_secret_expires_at: 0,
      redirect_uris: [this.redirectUrl],
      token_endpoint_auth_method: 'client_secret_basic',
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      client_name: 'Work OS Agent',
      scope: MCP_SCOPES.join(' '),
      issuer: this.resolvedIssuer ?? context?.issuer,
    };
  }

  saveClientInformation(
    information: StoredOAuthClientInformation,
    context?: OAuthClientInformationContext,
  ): void {
    const expected = this.clientInformation(context);
    if (
      information.client_id !== expected.client_id ||
      information.client_secret !== expected.client_secret
    ) {
      throw new McpAgentDelegationCredentialInvalidError();
    }
  }

  state(): string {
    if (!this.rawState) {
      throw new McpAgentDelegationFlowInvalidError();
    }
    return this.rawState;
  }

  tokens(
    context?: OAuthClientInformationContext,
  ): Promise<StoredOAuthTokens | undefined> {
    this.assertIssuer(context?.issuer);
    return this.credentials.tokens(this.actor, context?.issuer);
  }

  async saveTokens(
    tokens: StoredOAuthTokens,
    context?: OAuthClientInformationContext,
  ): Promise<void> {
    const issuer = context?.issuer ?? tokens.issuer;
    if (!issuer) {
      throw new McpAgentDelegationCredentialInvalidError();
    }
    this.assertIssuer(issuer);

    await this.credentials.saveTokens(
      this.actor,
      tokens,
      issuer,
      this.refreshLease,
    );
  }

  redirectToAuthorization(authorizationUrl: URL): void {
    if (this.redirectMode === 'reject') {
      throw new McpAgentDelegationRequiredError();
    }
    this.capturedAuthorizationUrl = new URL(authorizationUrl);
  }

  async saveCodeVerifier(codeVerifier: string): Promise<void> {
    if (!this.flow) {
      throw new McpAgentDelegationFlowInvalidError();
    }
    await this.flowStore.saveCodeVerifier(this.flow, codeVerifier);
  }

  codeVerifier(): Promise<string> {
    if (!this.flow) {
      throw new McpAgentDelegationFlowInvalidError();
    }
    return this.flowStore.codeVerifier(this.flow);
  }

  async saveDiscoveryState(state: OAuthDiscoveryState): Promise<void> {
    const issuer = normalizeOAuthIssuer(state.authorizationServerUrl);
    if (this.resolvedIssuer && this.resolvedIssuer !== issuer) {
      throw new McpAgentDelegationCredentialInvalidError();
    }
    this.resolvedIssuer = issuer;

    if (!this.flow) return;
    await this.flowStore.saveDiscoveryState(this.flow, state);
  }

  async discoveryState(): Promise<OAuthDiscoveryState | undefined> {
    if (!this.flow) return undefined;
    const state = await this.flowStore.discoveryState(this.flow);
    if (state) {
      const issuer = normalizeOAuthIssuer(state.authorizationServerUrl);
      if (this.resolvedIssuer && this.resolvedIssuer !== issuer) {
        throw new McpAgentDelegationCredentialInvalidError();
      }
      this.resolvedIssuer = issuer;
    }
    return state;
  }

  async invalidateCredentials(
    scope: 'all' | 'client' | 'tokens' | 'verifier' | 'discovery',
  ): Promise<void> {
    if (scope === 'tokens' || scope === 'all') {
      await this.credentials.revoke(this.actor);
    }
    if (
      this.flow &&
      (scope === 'verifier' || scope === 'discovery' || scope === 'all')
    ) {
      await this.flowStore.consume(this.flow);
    }
  }

  authorizationUrl(): URL {
    if (!this.capturedAuthorizationUrl) {
      throw new McpAgentDelegationFlowInvalidError();
    }
    return new URL(this.capturedAuthorizationUrl);
  }

  private assertIssuer(issuer: string | undefined): void {
    if (!issuer) return;

    const normalized = normalizeOAuthIssuer(issuer);
    if (!this.resolvedIssuer || this.resolvedIssuer !== normalized) {
      throw new McpAgentDelegationCredentialInvalidError();
    }
  }
}

function normalizeOAuthIssuer(issuer: string): string {
  const url = new URL(issuer);
  const isLoopback =
    url.hostname === 'localhost' ||
    url.hostname === '127.0.0.1' ||
    url.hostname === '[::1]';
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLoopback)) {
    throw new McpAgentDelegationCredentialInvalidError();
  }
  return url.toString();
}
