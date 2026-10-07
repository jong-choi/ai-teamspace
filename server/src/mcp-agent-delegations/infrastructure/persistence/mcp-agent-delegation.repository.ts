import type { McpAgentDelegation } from '@/mcp-agent-delegations/domain/mcp-agent-delegation';
import {
  mcpAgentDelegationInsertSchema,
  mcpAgentDelegationTokenUpdateSchema,
} from '@/mcp-agent-delegations/infrastructure/persistence/drizzle/schema/mcp-agent-delegation.zod';

import type { z } from 'zod';

export type McpAgentDelegationInsert = z.input<
  typeof mcpAgentDelegationInsertSchema
>;
export type McpAgentDelegationTokenUpdate = z.input<
  typeof mcpAgentDelegationTokenUpdateSchema
>;

export abstract class McpAgentDelegationRepository {
  abstract findActive(
    userId: string,
    organizationId: string,
    issuer: string,
    oauthClientIdentity: string,
  ): Promise<McpAgentDelegation | null>;

  abstract findLatestActive(
    userId: string,
    organizationId: string,
    oauthClientIdentity: string,
  ): Promise<McpAgentDelegation | null>;

  abstract upsertActive(
    input: McpAgentDelegationInsert,
  ): Promise<McpAgentDelegation>;

  abstract updateTokensUnderLease(
    delegationId: string,
    expectedRevision: number,
    leaseOwner: string,
    now: Date,
    input: McpAgentDelegationTokenUpdate,
  ): Promise<McpAgentDelegation | null>;

  abstract acquireRefreshLease(
    delegationId: string,
    leaseOwner: string,
    leaseExpiresAt: Date,
    now: Date,
  ): Promise<McpAgentDelegation | null>;

  abstract releaseRefreshLease(
    delegationId: string,
    leaseOwner: string,
  ): Promise<void>;

  abstract revokeActive(
    userId: string,
    organizationId: string,
    issuer: string,
    oauthClientIdentity: string,
  ): Promise<boolean>;
}
