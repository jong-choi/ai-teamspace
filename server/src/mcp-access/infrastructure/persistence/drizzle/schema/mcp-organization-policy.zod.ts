import { McpScopesSchema } from '@/mcp/contracts/mcp-scope';
import { mcpOrganizationPolicy } from '@/mcp-access/infrastructure/persistence/drizzle/schema/mcp-organization-policy.schema';

import {
  createInsertSchema,
  createSelectSchema,
  createUpdateSchema,
} from 'drizzle-zod';

const fieldRefinements = {
  allowedScopes: McpScopesSchema,
};

export const mcpOrganizationPolicySelectSchema = createSelectSchema(
  mcpOrganizationPolicy,
  fieldRefinements,
);

export const mcpOrganizationPolicyInsertSchema = createInsertSchema(
  mcpOrganizationPolicy,
  fieldRefinements,
);

export const mcpOrganizationPolicyUpdateSchema = createUpdateSchema(
  mcpOrganizationPolicy,
  fieldRefinements,
).partial();
