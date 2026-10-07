import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { AgentActor } from '@/agent/domain/agent-actor';
import { WorkOsMcpAuthProviderFactory } from '@/agent/infrastructure/mcp/workos-mcp-auth-provider.factory';
import type { AllConfigType } from '@/config/config.type';
import { McpAgentDelegationCredentialService } from '@/mcp-agent-delegations/mcp-agent-delegation-credential.service';
import {
  McpAgentDelegationRefreshConflictError,
  McpAgentDelegationRequiredError,
} from '@/mcp-agent-delegations/mcp-agent-delegation.error';
import { McpAgentDelegationOAuthClientProvider } from '@/mcp-agent-delegations/mcp-agent-delegation-oauth-client.provider';
import { McpAgentOauthFlowService } from '@/mcp-agent-delegations/mcp-agent-oauth-flow.service';
import { McpAgentDelegationRepository } from '@/mcp-agent-delegations/infrastructure/persistence/mcp-agent-delegation.repository';

import {
  auth,
  type AuthProvider,
  type FetchLike,
} from '@modelcontextprotocol/client';

const REFRESH_POLL_INTERVAL_MS = 50;

@Injectable()
export class McpAgentDelegationWorkOsAuthProviderFactory extends WorkOsMcpAuthProviderFactory {
  constructor(
    private readonly configService: ConfigService<AllConfigType>,
    private readonly credentials: McpAgentDelegationCredentialService,
    private readonly flowService: McpAgentOauthFlowService,
    private readonly repository: McpAgentDelegationRepository,
  ) {
    super();
  }

  create(actor: AgentActor): AuthProvider {
    const delegationActor = {
      userId: actor.userId,
      organizationId: actor.organizationId,
    };
    let lastPresentedToken: string | undefined;

    return {
      token: async () => {
        const token = (await this.credentials.tokens(delegationActor))
          ?.access_token;
        lastPresentedToken = token;
        return token;
      },
      onUnauthorized: async ({ serverUrl, fetchFn }) => {
        if (serverUrl.toString() !== this.config().resourceUrl) {
          throw new McpAgentDelegationRequiredError();
        }

        await this.refreshUnderLease(
          delegationActor,
          fetchFn,
          lastPresentedToken,
        );
      },
    };
  }

  private async refreshUnderLease(
    actor: { userId: string; organizationId: string },
    fetchFn: FetchLike,
    previouslyPresentedToken: string | undefined,
  ): Promise<void> {
    const row = await this.credentials.latest(actor);
    if (!row) {
      throw new McpAgentDelegationRequiredError();
    }

    const leaseOwner = randomUUID();
    const config = this.config();
    const now = new Date();
    const acquired = await this.repository.acquireRefreshLease(
      row.id,
      leaseOwner,
      new Date(
        now.getTime() + config.agentDelegation.refreshLeaseTtlSeconds * 1_000,
      ),
      now,
    );

    if (!acquired) {
      const changed = await this.waitForTokenChange(
        actor,
        previouslyPresentedToken,
      );
      if (changed) return;
      throw new McpAgentDelegationRefreshConflictError();
    }

    try {
      const currentToken = (
        await this.credentials.tokens(actor, acquired.issuer)
      )?.access_token;
      if (
        previouslyPresentedToken !== undefined &&
        currentToken !== undefined &&
        currentToken !== previouslyPresentedToken
      ) {
        return;
      }

      const provider = new McpAgentDelegationOAuthClientProvider(
        actor,
        config,
        this.credentials,
        this.flowService,
        'reject',
        undefined,
        undefined,
        {
          delegationId: acquired.id,
          expectedRevision: acquired.revision,
          leaseOwner,
        },
      );
      const result = await auth(provider, {
        serverUrl: new URL(config.resourceUrl),
        fetchFn,
      });
      if (result !== 'AUTHORIZED') {
        throw new McpAgentDelegationRequiredError();
      }
    } finally {
      await this.repository.releaseRefreshLease(acquired.id, leaseOwner);
    }
  }

  private async waitForTokenChange(
    actor: { userId: string; organizationId: string },
    previousToken: string | undefined,
  ): Promise<boolean> {
    const maxWaitMs = this.config().agentDelegation.refreshLeaseWaitMs;
    const attempts = Math.max(
      1,
      Math.ceil(maxWaitMs / REFRESH_POLL_INTERVAL_MS),
    );

    for (let attempt = 0; attempt < attempts; attempt += 1) {
      await new Promise((resolve) =>
        setTimeout(resolve, REFRESH_POLL_INTERVAL_MS),
      );
      const current = (await this.credentials.tokens(actor))?.access_token;
      if (current && current !== previousToken) return true;
    }
    return false;
  }

  private config(): AllConfigType['mcp'] {
    return this.configService.getOrThrow('mcp', { infer: true });
  }
}
