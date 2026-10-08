import { randomUUID } from 'node:crypto';

import { Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { AgentActor } from '@/agent/domain/agent-actor';
import { AgentMcpOauthClientProvider } from '@/agent-mcp-connections/application/agent-mcp-oauth-client.provider';
import { AgentMcpOauthCredentialService } from '@/agent-mcp-connections/application/agent-mcp-oauth-credential.service';
import { AgentMcpOauthStateService } from '@/agent-mcp-connections/application/agent-mcp-oauth-state.service';
import { classifyExternalMcpError } from '@/agent-mcp-connections/application/external-mcp-error-category';
import type { AgentMcpConnection } from '@/agent-mcp-connections/domain/agent-mcp-connection';
import {
  AgentMcpConnectionAuthKindMismatchError,
  AgentMcpConnectionNotFoundError,
  AgentMcpOauthAuthorizationRequiredError,
  AgentMcpOauthCredentialInvalidError,
  AgentMcpOauthStateInvalidError,
} from '@/agent-mcp-connections/domain/agent-mcp-connection.error';
import { AgentMcpAuditPublisher } from '@/agent-mcp-connections/infrastructure/audit/agent-mcp-audit.publisher';
import { SafeOutboundHttp } from '@/agent-mcp-connections/infrastructure/http/safe-outbound-http';
import { AgentMcpConnectionRepository } from '@/agent-mcp-connections/infrastructure/persistence/agent-mcp-connection.repository';
import type { AllConfigType } from '@/config/config.type';

import {
  auth,
  type AuthProvider,
  type FetchLike,
  OAuthError,
  StreamableHTTPClientTransport,
} from '@modelcontextprotocol/client';

const REFRESH_POLL_INTERVAL_MS = 50;
const REFRESH_POLL_MAX_MS = 2_000;

@Injectable()
export class AgentMcpOauthService {
  constructor(
    private readonly repository: AgentMcpConnectionRepository,
    private readonly credentials: AgentMcpOauthCredentialService,
    private readonly stateService: AgentMcpOauthStateService,
    private readonly safeOutbound: SafeOutboundHttp,
    private readonly configService: ConfigService<AllConfigType>,
    @Optional()
    private readonly auditPublisher?: AgentMcpAuditPublisher,
  ) {}

  async start(
    actor: AgentActor,
    connectionId: string,
  ): Promise<{ authorizationUrl: string }> {
    const connection = await this.requireOauthConnection(actor, connectionId);
    const provider = this.createProvider(actor, connectionId, 'capture');

    try {
      const endpoint = await this.safeOutbound.assertSafe(connection.endpoint);
      const result = await auth(provider, {
        serverUrl: endpoint,
        fetchFn: this.safeFetch,
        forceReauthorization: true,
      });
      if (result !== 'REDIRECT') {
        throw new AgentMcpOauthAuthorizationRequiredError();
      }

      await this.publishAudit({
        name: 'agent_mcp.oauth.started',
        actorUserId: actor.userId,
        organizationId: actor.organizationId,
        connectionId,
        resultCode: 'ok',
        authKind: connection.authKind,
      });
      return { authorizationUrl: provider.authorizationUrl().toString() };
    } catch (error) {
      await this.publishAudit({
        name: 'agent_mcp.oauth.failed',
        actorUserId: actor.userId,
        organizationId: actor.organizationId,
        connectionId,
        resultCode: 'failed',
        authKind: connection.authKind,
        errorCategory: classifyExternalMcpError(error),
      });
      throw error;
    }
  }

  async finish(
    actor: AgentActor,
    callbackParams: URLSearchParams,
  ): Promise<AgentMcpConnection> {
    const state = callbackParams.get('state');
    if (!state) {
      throw new AgentMcpOauthAuthorizationRequiredError();
    }

    const config = this.config();
    const pending = await this.stateService.resolveCallbackState(
      actor,
      state,
      config.oauthCallbackUrl,
    );
    const connection = await this.requireOauthConnection(
      actor,
      pending.connectionId,
    );
    const endpoint = await this.safeOutbound.assertSafe(connection.endpoint);
    const provider = this.createProvider(actor, connection.id, 'reject', state);
    const transport = new StreamableHTTPClientTransport(endpoint, {
      authProvider: provider,
      fetch: this.safeFetch,
      redirectPolicy: 'follow',
      onInsufficientScope: 'throw',
    });

    try {
      await transport.finishAuth(callbackParams);
      await this.stateService.consumeState(
        actor,
        connection.id,
        state,
        config.oauthCallbackUrl,
      );
      await this.publishAudit({
        name: 'agent_mcp.credential.replaced',
        actorUserId: actor.userId,
        organizationId: actor.organizationId,
        connectionId: connection.id,
        resultCode: 'ok',
        authKind: connection.authKind,
      });
      await this.publishAudit({
        name: 'agent_mcp.oauth.completed',
        actorUserId: actor.userId,
        organizationId: actor.organizationId,
        connectionId: connection.id,
        resultCode: 'ok',
        authKind: connection.authKind,
      });
      return connection;
    } catch (error) {
      await this.publishAudit({
        name: 'agent_mcp.oauth.failed',
        actorUserId: actor.userId,
        organizationId: actor.organizationId,
        connectionId: connection.id,
        resultCode: 'failed',
        authKind: connection.authKind,
        errorCategory: classifyExternalMcpError(error),
      });
      if (error instanceof OAuthError && error.code === 'invalid_grant') {
        throw new AgentMcpOauthStateInvalidError({ cause: error });
      }
      throw error;
    } finally {
      await transport.close().catch(() => undefined);
    }
  }

  createRuntimeAuthProvider(
    actor: AgentActor,
    connection: AgentMcpConnection,
  ): AuthProvider {
    if (connection.authKind !== 'oauth') {
      throw new AgentMcpConnectionAuthKindMismatchError();
    }

    let lastPresentedToken: string | undefined;
    return {
      token: async () => {
        const token = (await this.credentials.tokens(actor, connection.id))
          ?.access_token;
        lastPresentedToken = token;
        return token;
      },
      onUnauthorized: async ({ serverUrl, fetchFn }) => {
        this.assertResourceIdentity(connection, serverUrl);
        try {
          await this.refreshUnderLease(
            actor,
            connection,
            fetchFn,
            lastPresentedToken,
          );
          await this.recordRefreshHealth(actor, connection, null);
        } catch (error) {
          await this.recordRefreshHealth(
            actor,
            connection,
            classifyExternalMcpError(error),
          );
          throw error;
        }
      },
    };
  }

  private async refreshUnderLease(
    actor: AgentActor,
    connection: AgentMcpConnection,
    fetchFn: FetchLike,
    previouslyPresentedToken: string | undefined,
  ): Promise<void> {
    const leaseId = randomUUID();
    const now = new Date();
    const config = this.config();
    const leaseDurationMs =
      Math.max(config.connectTimeoutMs, config.toolTimeoutMs) + 5_000;
    const acquired = await this.repository.acquireCredentialRefreshLease(
      actor.userId,
      actor.organizationId,
      connection.id,
      leaseId,
      now,
      new Date(now.getTime() + leaseDurationMs),
    );

    if (!acquired) {
      const refreshed = await this.waitForTokenChange(
        actor,
        connection.id,
        previouslyPresentedToken,
      );
      if (refreshed) {
        return;
      }
      throw new AgentMcpOauthAuthorizationRequiredError();
    }

    try {
      const currentToken = (await this.credentials.tokens(actor, connection.id))
        ?.access_token;
      if (
        previouslyPresentedToken !== undefined &&
        currentToken !== undefined &&
        currentToken !== previouslyPresentedToken
      ) {
        return;
      }

      const provider = this.createProvider(actor, connection.id, 'reject');
      const result = await auth(provider, {
        serverUrl: connection.endpoint,
        fetchFn,
      });
      if (result !== 'AUTHORIZED') {
        throw new AgentMcpOauthAuthorizationRequiredError();
      }
      await this.publishAudit({
        name: 'agent_mcp.credential.refreshed',
        actorUserId: actor.userId,
        organizationId: actor.organizationId,
        connectionId: connection.id,
        resultCode: 'ok',
        authKind: connection.authKind,
      });
    } finally {
      await this.repository.releaseCredentialRefreshLease(
        actor.userId,
        actor.organizationId,
        connection.id,
        leaseId,
      );
    }
  }

  private async waitForTokenChange(
    actor: AgentActor,
    connectionId: string,
    previousToken: string | undefined,
  ): Promise<boolean> {
    const attempts = Math.ceil(REFRESH_POLL_MAX_MS / REFRESH_POLL_INTERVAL_MS);
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      await new Promise((resolve) =>
        setTimeout(resolve, REFRESH_POLL_INTERVAL_MS),
      );
      const token = (await this.credentials.tokens(actor, connectionId))
        ?.access_token;
      if (token && token !== previousToken) {
        return true;
      }
    }
    return false;
  }

  private createProvider(
    actor: AgentActor,
    connectionId: string,
    redirectMode: 'capture' | 'reject',
    state?: string,
  ): AgentMcpOauthClientProvider {
    return new AgentMcpOauthClientProvider(
      actor,
      connectionId,
      this.config().oauthCallbackUrl,
      this.credentials,
      this.stateService,
      redirectMode,
      state,
    );
  }

  private async requireOauthConnection(
    actor: AgentActor,
    connectionId: string,
  ): Promise<AgentMcpConnection> {
    const connection = await this.repository.findOwned(
      actor.userId,
      actor.organizationId,
      connectionId,
    );
    if (!connection) {
      throw new AgentMcpConnectionNotFoundError();
    }
    if (connection.authKind !== 'oauth') {
      throw new AgentMcpConnectionAuthKindMismatchError();
    }
    return connection;
  }

  private assertResourceIdentity(
    connection: AgentMcpConnection,
    serverUrl: URL,
  ): void {
    if (new URL(connection.endpoint).toString() !== serverUrl.toString()) {
      throw new AgentMcpOauthCredentialInvalidError();
    }
  }

  private async recordRefreshHealth(
    actor: AgentActor,
    connection: AgentMcpConnection,
    errorCategory: ReturnType<typeof classifyExternalMcpError> | null,
  ): Promise<void> {
    await this.repository
      .recordHealth(
        actor.userId,
        actor.organizationId,
        connection.id,
        new Date(),
        errorCategory,
      )
      .catch(() => null);
  }

  private async publishAudit(
    event: Parameters<AgentMcpAuditPublisher['publish']>[0],
  ): Promise<void> {
    try {
      await this.auditPublisher?.publish(event);
    } catch {
      // audit sink failure는 OAuth lifecycle 결과를 바꾸지 않는다.
    }
  }

  private config() {
    return this.configService.getOrThrow('agentMcpConnections', {
      infer: true,
    });
  }

  private readonly safeFetch: FetchLike = (input, init) =>
    this.safeOutbound.fetch(input, init);
}
