import { McpScopesSchema } from '@/mcp/contracts/mcp-scope';
import { mcpUserPolicy } from '@/mcp-access/infrastructure/persistence/drizzle/schema/mcp-user-policy.schema';

import {
  createInsertSchema,
  createSelectSchema,
  createUpdateSchema,
} from 'drizzle-zod';

const fieldRefinements = {
  requestedScopes: McpScopesSchema,
};

export const mcpUserPolicySelectSchema = createSelectSchema(
  mcpUserPolicy,
  fieldRefinements,
);

export const mcpUserPolicyInsertSchema = createInsertSchema(
  mcpUserPolicy,
  fieldRefinements,
);

export const mcpUserPolicyUpdateSchema = createUpdateSchema(
  mcpUserPolicy,
  fieldRefinements,
).partial();
