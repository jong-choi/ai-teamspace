import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { AllConfigType } from '@/config/config.type';
import { MCP_SCOPES } from '@/mcp/contracts/mcp-scope';
import type {
  McpAgentDelegationStatus,
  StartMcpAgentDelegationResponse,
} from '@/mcp-agent-delegations/dto/mcp-agent-delegation.dto';
import { McpAgentDelegationCredentialService } from '@/mcp-agent-delegations/mcp-agent-delegation-credential.service';
import {
  McpAgentDelegationFlowInvalidError,
  McpAgentDelegationRequiredError,
  McpAgentDelegationRevocationError,
} from '@/mcp-agent-delegations/mcp-agent-delegation.error';
import { McpAgentDelegationOAuthClientProvider } from '@/mcp-agent-delegations/mcp-agent-delegation-oauth-client.provider';
import {
  type McpAgentDelegationActor,
  McpAgentOauthFlowService,
} from '@/mcp-agent-delegations/mcp-agent-oauth-flow.service';
import { McpAgentTokenRevocationProvider } from '@/mcp-agent-delegations/infrastructure/oauth-server/mcp-agent-token-revocation.provider';
import { McpAgentOauthFlowRepository } from '@/mcp-agent-delegations/infrastructure/persistence/mcp-agent-oauth-flow.repository';
import { OrganizationMembershipService } from '@/organizations/organization-membership.service';

import {
  auth,
  Client,
  StreamableHTTPClientTransport,
} from '@modelcontextprotocol/client';

@Injectable()
export class McpAgentDelegationService {
  constructor(
    private readonly configService: ConfigService<AllConfigType>,
    private readonly credentials: McpAgentDelegationCredentialService,
    private readonly flowService: McpAgentOauthFlowService,
    private readonly flowRepository: McpAgentOauthFlowRepository,
    private readonly membershipService: OrganizationMembershipService,
    private readonly tokenRevocation: McpAgentTokenRevocationProvider,
  ) {}

  async status(
    actor: McpAgentDelegationActor | null,
  ): Promise<McpAgentDelegationStatus> {
    if (!actor) {
      return {
        status: 'no_membership',
        grantedScopes: [],
        expiresAt: null,
      };
    }

    const hasMembership = await this.membershipService.hasMemberUser(
      actor.organizationId,
      actor.userId,
    );
    if (!hasMembership) {
      return {
        status: 'no_membership',
        grantedScopes: [],
        expiresAt: null,
      };
    }

    const delegation = await this.credentials.latest(actor);
    if (delegation) {
      const tokens = await this.credentials.tokens(actor, delegation.issuer);
      if (!tokens) {
        return {
          status: 'refresh_required',
          grantedScopes: delegation.grantedScopes,
          expiresAt: null,
        };
      }

      const expiresAt =
        typeof tokens.expires_in === 'number'
          ? new Date(delegation.updatedAt.getTime() + tokens.expires_in * 1_000)
          : null;
      const expired = expiresAt !== null && expiresAt.getTime() <= Date.now();

      return {
        status:
          expired && !tokens.refresh_token ? 'refresh_required' : 'active',
        grantedScopes: delegation.grantedScopes,
        expiresAt: expiresAt?.toISOString() ?? null,
      };
    }

    const pending = await this.flowRepository.findLatestActiveForActor(
      actor.userId,
      actor.organizationId,
      this.config().agentDelegation.clientId,
      new Date(),
    );
    return pending
      ? {
          status: 'pending_consent',
          grantedScopes: pending.requestedScopes,
          expiresAt: pending.expiresAt.toISOString(),
        }
      : {
          status: 'not_connected',
          grantedScopes: [],
          expiresAt: null,
        };
  }

  async start(
    actor: McpAgentDelegationActor,
    returnTo: string,
    completionUrl: string,
  ): Promise<StartMcpAgentDelegationResponse> {
    await this.requireMembership(actor);
    const created = await this.flowService.create(
      actor,
      returnTo,
      completionUrl,
    );
    const provider = new McpAgentDelegationOAuthClientProvider(
      actor,
      this.config(),
      this.credentials,
      this.flowService,
      'capture',
      created.flow,
      created.state,
    );

    const result = await auth(provider, {
      serverUrl: new URL(this.config().resourceUrl),
      forceReauthorization: true,
    });
    if (result !== 'REDIRECT') {
      throw new McpAgentDelegationRequiredError();
    }

    return {
      status: 'pending_consent',
      authorizationUrl: provider.authorizationUrl().toString(),
      grantedScopes: [...MCP_SCOPES],
      expiresAt: created.flow.expiresAt.toISOString(),
    };
  }

  async finish(
    callbackParams: URLSearchParams,
  ): Promise<{ completionUrl: string }> {
    const state = callbackParams.get('state');
    if (!state) {
      throw new McpAgentDelegationFlowInvalidError();
    }

    const flow = await this.flowService.resolveCallback(state);
    const actor = {
      userId: flow.userId,
      organizationId: flow.organizationId,
    };
    await this.requireMembership(actor);

    const provider = new McpAgentDelegationOAuthClientProvider(
      actor,
      this.config(),
      this.credentials,
      this.flowService,
      'reject',
      flow,
      state,
    );
    const transport = new StreamableHTTPClientTransport(
      new URL(this.config().resourceUrl),
      {
        authProvider: provider,
        onInsufficientScope: 'throw',
      },
    );
    let consumed = false;

    try {
      await transport.finishAuth(callbackParams);
      await this.flowService.consume(flow);
      consumed = true;
      await this.smokeReconnect(actor);
      return { completionUrl: flow.completionUrl };
    } catch (error) {
      if (!consumed) {
        await this.flowService.consume(flow).catch(() => undefined);
      }
      if (error instanceof McpAgentDelegationFlowInvalidError) {
        throw error;
      }
      throw new McpAgentDelegationFlowInvalidError({ cause: error });
    } finally {
      await transport.close().catch(() => undefined);
    }
  }

  async revoke(actor: McpAgentDelegationActor | null): Promise<void> {
    if (!actor) return;

    let remoteFailure: unknown;
    try {
      const tokens = await this.credentials.tokens(actor);
      if (tokens?.refresh_token) {
        await this.tokenRevocation.revokeRefreshToken(tokens.refresh_token);
      }
    } catch (error) {
      remoteFailure = error;
    } finally {
      await this.credentials.revoke(actor);
    }

    if (remoteFailure !== undefined) {
      throw new McpAgentDelegationRevocationError({ cause: remoteFailure });
    }
  }

  private async smokeReconnect(actor: McpAgentDelegationActor): Promise<void> {
    const provider = new McpAgentDelegationOAuthClientProvider(
      actor,
      this.config(),
      this.credentials,
      this.flowService,
      'reject',
    );
    const transport = new StreamableHTTPClientTransport(
      new URL(this.config().resourceUrl),
      {
        authProvider: provider,
        onInsufficientScope: 'throw',
      },
    );
    const client = new Client({
      name: 'work-os-agent-delegation-smoke',
      version: '0.0.1',
    });

    try {
      await client.connect(transport);
    } finally {
      await client.close().catch(() => undefined);
      await transport.close().catch(() => undefined);
    }
  }

  private async requireMembership(
    actor: McpAgentDelegationActor,
  ): Promise<void> {
    const hasMembership = await this.membershipService.hasMemberUser(
      actor.organizationId,
      actor.userId,
    );
    if (!hasMembership) {
      throw new McpAgentDelegationRequiredError();
    }
  }

  private config(): AllConfigType['mcp'] {
    return this.configService.getOrThrow('mcp', { infer: true });
  }
}
