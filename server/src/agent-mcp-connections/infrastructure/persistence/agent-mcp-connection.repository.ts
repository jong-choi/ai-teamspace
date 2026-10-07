import type { AgentMcpConnection } from '@/agent-mcp-connections/domain/agent-mcp-connection';
import type { AgentMcpLastErrorCategory } from '@/agent-mcp-connections/domain/agent-mcp-connection-health';
import type { AgentMcpConnectionTool } from '@/agent-mcp-connections/domain/agent-mcp-connection-tool';
import type { AgentMcpCredential } from '@/agent-mcp-connections/domain/agent-mcp-credential';
import type { AgentMcpOauthState } from '@/agent-mcp-connections/domain/agent-mcp-oauth-state';
import type {
  agentMcpConnectionInsertSchema,
  agentMcpConnectionMutableSchema,
} from '@/agent-mcp-connections/infrastructure/persistence/drizzle/schema/agent-mcp-connection.zod';
import type { agentMcpConnectionToolPolicyInputSchema } from '@/agent-mcp-connections/infrastructure/persistence/drizzle/schema/agent-mcp-connection-tool.zod';
import type { agentMcpCredentialInsertSchema } from '@/agent-mcp-connections/infrastructure/persistence/drizzle/schema/agent-mcp-credential.zod';
import type {
  agentMcpOauthStateDiscoveryUpdateSchema,
  agentMcpOauthStateInsertSchema,
  agentMcpOauthStateVerifierUpdateSchema,
} from '@/agent-mcp-connections/infrastructure/persistence/drizzle/schema/agent-mcp-oauth-state.zod';

import type { z } from 'zod';

export abstract class AgentMcpConnectionRepository {
  abstract createPendingConnection(
    input: z.input<typeof agentMcpConnectionInsertSchema>,
  ): Promise<AgentMcpConnection>;

  abstract findOwned(
    ownerUserId: string,
    organizationId: string,
    connectionId: string,
  ): Promise<AgentMcpConnection | null>;

  abstract listOwned(
    ownerUserId: string,
    organizationId: string,
  ): Promise<AgentMcpConnection[]>;

  abstract listEnabledForActor(
    ownerUserId: string,
    organizationId: string,
  ): Promise<AgentMcpConnection[]>;

  abstract updateIfRevision(
    ownerUserId: string,
    organizationId: string,
    connectionId: string,
    expectedRevision: number,
    patch: z.input<typeof agentMcpConnectionMutableSchema>,
  ): Promise<AgentMcpConnection | null>;

  abstract removeOwned(
    ownerUserId: string,
    organizationId: string,
    connectionId: string,
    expectedRevision: number,
  ): Promise<boolean>;

  abstract updateSecurityBoundaryIfRevision(
    ownerUserId: string,
    organizationId: string,
    connectionId: string,
    expectedRevision: number,
    patch: z.input<typeof agentMcpConnectionMutableSchema>,
  ): Promise<AgentMcpConnection | null>;

  abstract recordHealth(
    ownerUserId: string,
    organizationId: string,
    connectionId: string,
    testedAt: Date,
    errorCategory: AgentMcpLastErrorCategory | null,
  ): Promise<AgentMcpConnection | null>;

  abstract saveCredential(
    input: z.input<typeof agentMcpCredentialInsertSchema>,
  ): Promise<void>;

  abstract findCredentialForOwnedConnection(
    ownerUserId: string,
    organizationId: string,
    connectionId: string,
  ): Promise<AgentMcpCredential | null>;

  abstract replaceCredentialIfRevision(
    ownerUserId: string,
    organizationId: string,
    input: z.input<typeof agentMcpCredentialInsertSchema>,
    expectedRevision: number | null,
  ): Promise<AgentMcpCredential | null>;

  abstract acquireCredentialRefreshLease(
    ownerUserId: string,
    organizationId: string,
    connectionId: string,
    leaseId: string,
    now: Date,
    expiresAt: Date,
  ): Promise<boolean>;

  abstract releaseCredentialRefreshLease(
    ownerUserId: string,
    organizationId: string,
    connectionId: string,
    leaseId: string,
  ): Promise<void>;

  abstract updateToolPolicyIfRevision(
    ownerUserId: string,
    organizationId: string,
    connectionId: string,
    expectedRevision: number,
    mode: AgentMcpConnection['toolPolicyMode'],
    tools: readonly z.input<typeof agentMcpConnectionToolPolicyInputSchema>[],
  ): Promise<AgentMcpConnection | null>;

  abstract listEnabledTools(
    connectionId: string,
  ): Promise<AgentMcpConnectionTool[]>;

  abstract createOAuthState(
    input: z.input<typeof agentMcpOauthStateInsertSchema>,
  ): Promise<AgentMcpOauthState | null>;

  abstract findActiveOAuthState(
    ownerUserId: string,
    organizationId: string,
    connectionId: string,
    stateHash: string,
    now: Date,
  ): Promise<AgentMcpOauthState | null>;

  abstract findActiveOAuthStateByHash(
    ownerUserId: string,
    organizationId: string,
    stateHash: string,
    now: Date,
  ): Promise<AgentMcpOauthState | null>;

  abstract saveOAuthStateVerifier(
    ownerUserId: string,
    organizationId: string,
    connectionId: string,
    stateHash: string,
    now: Date,
    envelope: z.input<typeof agentMcpOauthStateVerifierUpdateSchema>,
  ): Promise<boolean>;

  abstract saveOAuthStateDiscovery(
    ownerUserId: string,
    organizationId: string,
    connectionId: string,
    stateHash: string,
    now: Date,
    snapshot: z.input<typeof agentMcpOauthStateDiscoveryUpdateSchema>,
  ): Promise<boolean>;

  abstract consumeOAuthState(
    ownerUserId: string,
    organizationId: string,
    connectionId: string,
    stateHash: string,
    now: Date,
  ): Promise<AgentMcpOauthState | null>;
}
