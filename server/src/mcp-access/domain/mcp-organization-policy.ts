import { mcpOrganizationPolicySelectSchema } from '@/mcp-access/infrastructure/persistence/drizzle/schema/mcp-organization-policy.zod';

import type { z } from 'zod';

export type McpOrganizationPolicy = z.infer<
  typeof mcpOrganizationPolicySelectSchema
>;
