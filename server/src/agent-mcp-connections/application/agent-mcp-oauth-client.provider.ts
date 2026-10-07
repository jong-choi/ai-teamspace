import { AgentMcpOauthCredentialService } from '@/agent-mcp-connections/application/agent-mcp-oauth-credential.service';
import { AgentMcpOauthStateService } from '@/agent-mcp-connections/application/agent-mcp-oauth-state.service';
import {
  AgentMcpOauthAuthorizationRequiredError,
  AgentMcpOauthCredentialInvalidError,
  AgentMcpOauthStateInvalidError,
} from '@/agent-mcp-connections/domain/agent-mcp-connection.error';
import type { AgentActor } from '@/agent/domain/agent-actor';

import type {
  OAuthClientInformationContext,
  OAuthClientMetadata,
  OAuthClientProvider,
  OAuthDiscoveryState,
  StoredOAuthClientInformation,
  StoredOAuthTokens,
} from '@modelcontextprotocol/client';

export type AgentMcpOauthRedirectMode = 'capture' | 'reject';

export class AgentMcpOauthClientProvider implements OAuthClientProvider {
  private currentState?: string;
  private capturedAuthorizationUrl?: URL;

  constructor(
    private readonly actor: AgentActor,
    private readonly connectionId: string,
    private readonly callbackUrl: string,
    private readonly credentials: AgentMcpOauthCredentialService,
    private readonly stateService: AgentMcpOauthStateService,
    private readonly redirectMode: AgentMcpOauthRedirectMode,
    initialState?: string,
  ) {
    this.currentState = initialState;
  }

  get redirectUrl(): string {
    return this.callbackUrl;
  }

  get clientMetadata(): OAuthClientMetadata {
    return {
      redirect_uris: [this.callbackUrl],
      token_endpoint_auth_method: 'none',
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      client_name: 'Work OS Agent',
      software_id: 'work-os-agent-external-mcp',
    };
  }

  async state(): Promise<string> {
    if (this.currentState) {
      return this.currentState;
    }
    const created = await this.stateService.createState(
      this.actor,
      this.connectionId,
      this.callbackUrl,
    );
    this.currentState = created.state;
    return created.state;
  }

  clientInformation(
    context?: OAuthClientInformationContext,
  ): Promise<StoredOAuthClientInformation | undefined> {
    if (!context?.issuer) {
      return Promise.resolve(undefined);
    }
    return this.credentials.clientInformation(
      this.actor,
      this.connectionId,
      context.issuer,
    );
  }

  async saveClientInformation(
    clientInformation: StoredOAuthClientInformation,
    context?: OAuthClientInformationContext,
  ): Promise<void> {
    const issuer = context?.issuer ?? clientInformation.issuer;
    if (!issuer) {
      throw new AgentMcpOauthCredentialInvalidError();
    }
    await this.credentials.saveClientInformation(
      this.actor,
      this.connectionId,
      clientInformation,
      issuer,
    );
  }

  tokens(
    context?: OAuthClientInformationContext,
  ): Promise<StoredOAuthTokens | undefined> {
    return this.credentials.tokens(
      this.actor,
      this.connectionId,
      context?.issuer,
    );
  }

  async saveTokens(
    tokens: StoredOAuthTokens,
    context?: OAuthClientInformationContext,
  ): Promise<void> {
    const issuer = context?.issuer ?? tokens.issuer;
    if (!issuer) {
      throw new AgentMcpOauthCredentialInvalidError();
    }
    await this.credentials.saveTokens(
      this.actor,
      this.connectionId,
      tokens,
      issuer,
    );
  }

  async invalidateCredentials(
    scope: 'all' | 'client' | 'tokens' | 'verifier' | 'discovery',
  ): Promise<void> {
    if (scope === 'client' || scope === 'tokens' || scope === 'all') {
      await this.credentials.invalidate(
        this.actor,
        this.connectionId,
        scope === 'all' ? 'all' : scope,
      );
    }

    if (
      this.currentState &&
      (scope === 'verifier' || scope === 'discovery' || scope === 'all')
    ) {
      await this.stateService.consumeState(
        this.actor,
        this.connectionId,
        this.currentState,
        this.callbackUrl,
      );
    }
  }

  redirectToAuthorization(authorizationUrl: URL): void {
    if (this.redirectMode === 'reject') {
      throw new AgentMcpOauthAuthorizationRequiredError();
    }
    this.capturedAuthorizationUrl = new URL(authorizationUrl);
  }

  async saveCodeVerifier(codeVerifier: string): Promise<void> {
    const state = this.requireState();
    await this.stateService.saveCodeVerifier(
      this.actor,
      this.connectionId,
      state,
      this.callbackUrl,
      codeVerifier,
    );
  }

  codeVerifier(): Promise<string> {
    return this.stateService.codeVerifier(
      this.actor,
      this.connectionId,
      this.requireState(),
      this.callbackUrl,
    );
  }

  async saveDiscoveryState(discoveryState: OAuthDiscoveryState): Promise<void> {
    if (!this.currentState) {
      return;
    }
    await this.stateService.saveDiscoveryState(
      this.actor,
      this.connectionId,
      this.currentState,
      this.callbackUrl,
      discoveryState,
    );
  }

  discoveryState(): Promise<OAuthDiscoveryState | undefined> {
    if (!this.currentState) {
      return Promise.resolve(undefined);
    }
    return this.stateService.discoveryState(
      this.actor,
      this.connectionId,
      this.currentState,
      this.callbackUrl,
    );
  }

  authorizationUrl(): URL {
    if (!this.capturedAuthorizationUrl) {
      throw new AgentMcpOauthStateInvalidError();
    }
    return new URL(this.capturedAuthorizationUrl);
  }

  private requireState(): string {
    if (!this.currentState) {
      throw new AgentMcpOauthStateInvalidError();
    }
    return this.currentState;
  }
}
