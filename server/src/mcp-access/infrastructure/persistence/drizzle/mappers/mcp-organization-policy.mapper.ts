import type { McpOrganizationPolicy } from '@/mcp-access/domain/mcp-organization-policy';
import {
  mcpOrganizationPolicyInsertSchema,
  mcpOrganizationPolicySelectSchema,
  mcpOrganizationPolicyUpdateSchema,
} from '@/mcp-access/infrastructure/persistence/drizzle/schema/mcp-organization-policy.zod';

import type { z } from 'zod';

export function toMcpOrganizationPolicyDomain(
  row: unknown,
): McpOrganizationPolicy {
  return mcpOrganizationPolicySelectSchema.parse(row);
}

export function toMcpOrganizationPolicyInsert(
  input: z.input<typeof mcpOrganizationPolicyInsertSchema>,
) {
  return mcpOrganizationPolicyInsertSchema.parse(input);
}

export function toMcpOrganizationPolicyUpdate(
  input: z.input<typeof mcpOrganizationPolicyUpdateSchema>,
) {
  return mcpOrganizationPolicyUpdateSchema.parse(input);
}
