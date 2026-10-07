import type { AgentMcpConnection } from '@/agent-mcp-connections/domain/agent-mcp-connection';
import { AgentMcpLastErrorCategorySchema } from '@/agent-mcp-connections/domain/agent-mcp-connection-health';
import { createZodDto } from '@/common/dto/create-zod-dto';

import { z } from 'zod';

export const AgentMcpConnectionStatusSchema = z.enum([
  'disabled',
  'ready',
  'authorization_required',
  'credential_expired',
  'test_failed',
  'unavailable',
]);

export const AgentMcpToolPolicySummarySchema = z
  .object({
    mode: z.enum(['selected', 'all']),
    selectedToolCount: z.number().int().nonnegative(),
  })
  .meta({ id: 'AgentMcpToolPolicySummary' });

export const AgentMcpConnectionSchema = z
  .object({
    id: z.uuid(),
    displayName: z.string(),
    namespace: z.string(),
    publicHost: z.string(),
    authKind: z.enum(['none', 'bearer', 'oauth']),
    credentialConfigured: z.boolean(),
    enabled: z.boolean(),
    status: AgentMcpConnectionStatusSchema,
    revision: z.number().int().nonnegative(),
    toolPolicy: AgentMcpToolPolicySummarySchema,
    lastTestedAt: z.string().datetime().nullable(),
    lastErrorCategory: AgentMcpLastErrorCategorySchema.nullable(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .meta({ id: 'AgentMcpConnection' });

export const AgentMcpConnectionListSchema = z
  .object({
    items: z.array(AgentMcpConnectionSchema),
  })
  .meta({ id: 'AgentMcpConnectionList' });

export type AgentMcpConnectionResponse = z.infer<
  typeof AgentMcpConnectionSchema
>;
export type AgentMcpConnectionListResponse = z.infer<
  typeof AgentMcpConnectionListSchema
>;

export function toAgentMcpConnectionResponse(input: {
  connection: AgentMcpConnection;
  credentialConfigured: boolean;
  selectedToolCount: number;
}): AgentMcpConnectionResponse {
  const { connection, credentialConfigured, selectedToolCount } = input;
  const status = deriveConnectionStatus(connection, credentialConfigured);

  return AgentMcpConnectionSchema.parse({
    id: connection.id,
    displayName: connection.displayName,
    namespace: connection.namespace,
    publicHost: new URL(connection.endpoint).host,
    authKind: connection.authKind,
    credentialConfigured,
    enabled: connection.enabled,
    status,
    revision: connection.revision,
    toolPolicy: {
      mode: connection.toolPolicyMode,
      selectedToolCount,
    },
    lastTestedAt: connection.lastTestedAt?.toISOString() ?? null,
    lastErrorCategory: connection.lastErrorCategory,
    createdAt: connection.createdAt.toISOString(),
    updatedAt: connection.updatedAt.toISOString(),
  });
}

function deriveConnectionStatus(
  connection: AgentMcpConnection,
  credentialConfigured: boolean,
): z.infer<typeof AgentMcpConnectionStatusSchema> {
  if (!connection.enabled) {
    return 'disabled';
  }
  if (!credentialConfigured) {
    return 'authorization_required';
  }
  if (connection.lastErrorCategory === 'credential_expired') {
    return 'credential_expired';
  }
  if (connection.lastErrorCategory === 'authorization_required') {
    return 'authorization_required';
  }
  if (connection.lastErrorCategory === 'connection_unavailable') {
    return 'unavailable';
  }
  if (connection.lastErrorCategory) {
    return 'test_failed';
  }
  return 'ready';
}

export class AgentMcpConnectionDto extends createZodDto(
  AgentMcpConnectionSchema,
) {}

export class AgentMcpConnectionListDto extends createZodDto(
  AgentMcpConnectionListSchema,
) {}
