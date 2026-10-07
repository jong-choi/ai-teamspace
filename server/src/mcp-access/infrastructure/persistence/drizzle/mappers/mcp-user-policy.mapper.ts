import type { McpUserPolicy } from '@/mcp-access/domain/mcp-user-policy';
import {
  mcpUserPolicyInsertSchema,
  mcpUserPolicySelectSchema,
  mcpUserPolicyUpdateSchema,
} from '@/mcp-access/infrastructure/persistence/drizzle/schema/mcp-user-policy.zod';

import type { z } from 'zod';

export function toMcpUserPolicyDomain(row: unknown): McpUserPolicy {
  return mcpUserPolicySelectSchema.parse(row);
}

export function toMcpUserPolicyInsert(
  input: z.input<typeof mcpUserPolicyInsertSchema>,
) {
  return mcpUserPolicyInsertSchema.parse(input);
}

export function toMcpUserPolicyUpdate(
  input: z.input<typeof mcpUserPolicyUpdateSchema>,
) {
  return mcpUserPolicyUpdateSchema.parse(input);
}
