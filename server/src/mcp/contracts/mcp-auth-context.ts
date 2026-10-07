import { McpScopesSchema } from '@/mcp/contracts/mcp-scope';

import { z } from 'zod';

export const McpAuthMethodSchema = z.enum([
  'oauth',
  'api-key',
  'first-party-agent',
]);

export const McpAuthContextSchema = z.object({
  authMethod: McpAuthMethodSchema,
  credentialId: z.string().trim().min(1).nullable(),
  userId: z.string().trim().min(1),
  clientId: z.string().trim().min(1).nullable(),
  scopes: McpScopesSchema,
  allowedOrganizationIds: z
    .array(z.string().trim().min(1))
    .overwrite((ids) => [...new Set(ids)])
    .nullable(),
});

export type McpAuthMethod = z.infer<typeof McpAuthMethodSchema>;
export type McpAuthContext = z.infer<typeof McpAuthContextSchema>;
