import type { McpAgentOauthFlow } from '@/mcp-agent-delegations/domain/mcp-agent-oauth-flow';
import {
  mcpAgentOauthFlowDiscoveryUpdateSchema,
  mcpAgentOauthFlowInsertSchema,
  mcpAgentOauthFlowVerifierUpdateSchema,
} from '@/mcp-agent-delegations/infrastructure/persistence/drizzle/schema/mcp-agent-oauth-flow.zod';

import type { z } from 'zod';

export type McpAgentOauthFlowInsert = z.input<
  typeof mcpAgentOauthFlowInsertSchema
>;
export type McpAgentOauthFlowVerifierUpdate = z.input<
  typeof mcpAgentOauthFlowVerifierUpdateSchema
>;
export type McpAgentOauthFlowDiscoveryUpdate = z.input<
  typeof mcpAgentOauthFlowDiscoveryUpdateSchema
>;

export abstract class McpAgentOauthFlowRepository {
  abstract create(input: McpAgentOauthFlowInsert): Promise<McpAgentOauthFlow>;

  abstract findActiveByStateHash(
    stateHash: string,
    now: Date,
  ): Promise<McpAgentOauthFlow | null>;

  abstract findLatestActiveForActor(
    userId: string,
    organizationId: string,
    oauthClientIdentity: string,
    now: Date,
  ): Promise<McpAgentOauthFlow | null>;

  abstract findActiveById(
    flowId: string,
    userId: string,
    organizationId: string,
    now: Date,
  ): Promise<McpAgentOauthFlow | null>;

  abstract saveVerifierIfAbsent(
    flowId: string,
    userId: string,
    organizationId: string,
    now: Date,
    input: McpAgentOauthFlowVerifierUpdate,
  ): Promise<McpAgentOauthFlow | null>;

  abstract saveDiscovery(
    flowId: string,
    userId: string,
    organizationId: string,
    now: Date,
    input: McpAgentOauthFlowDiscoveryUpdate,
  ): Promise<McpAgentOauthFlow | null>;

  abstract consume(
    flowId: string,
    userId: string,
    organizationId: string,
    now: Date,
  ): Promise<McpAgentOauthFlow | null>;
}
