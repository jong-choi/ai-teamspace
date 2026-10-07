import { createZodDto } from '@/common/dto/create-zod-dto';
import type { McpOrganizationPolicy } from '@/mcp-access/domain/mcp-organization-policy';
import type { McpUserPolicy } from '@/mcp-access/domain/mcp-user-policy';
import { mcpOrganizationPolicySelectSchema } from '@/mcp-access/infrastructure/persistence/drizzle/schema/mcp-organization-policy.zod';
import { mcpUserPolicySelectSchema } from '@/mcp-access/infrastructure/persistence/drizzle/schema/mcp-user-policy.zod';

import { z } from 'zod';

export const McpOrganizationPolicyResponseSchema =
  mcpOrganizationPolicySelectSchema
    .pick({
      allowedScopes: true,
      revision: true,
      updatedAt: true,
    })
    .omit({ updatedAt: true })
    .extend({ updatedAt: z.string().datetime() })
    .meta({ id: 'McpOrganizationPolicy' });

export const McpUserPolicyResponseSchema = mcpUserPolicySelectSchema
  .pick({
    requestedScopes: true,
    revision: true,
    updatedAt: true,
  })
  .omit({ updatedAt: true })
  .extend({ updatedAt: z.string().datetime() })
  .meta({ id: 'McpUserPolicy' });

export type McpOrganizationPolicyResponse = z.infer<
  typeof McpOrganizationPolicyResponseSchema
>;
export type McpUserPolicyResponse = z.infer<typeof McpUserPolicyResponseSchema>;

export function toMcpOrganizationPolicyResponse(
  policy: McpOrganizationPolicy,
): McpOrganizationPolicyResponse {
  return McpOrganizationPolicyResponseSchema.parse({
    allowedScopes: policy.allowedScopes,
    revision: policy.revision,
    updatedAt: policy.updatedAt.toISOString(),
  });
}

export function toMcpUserPolicyResponse(
  policy: McpUserPolicy,
): McpUserPolicyResponse {
  return McpUserPolicyResponseSchema.parse({
    requestedScopes: policy.requestedScopes,
    revision: policy.revision,
    updatedAt: policy.updatedAt.toISOString(),
  });
}

export class McpOrganizationPolicyDto extends createZodDto(
  McpOrganizationPolicyResponseSchema,
) {}

export class McpUserPolicyDto extends createZodDto(
  McpUserPolicyResponseSchema,
) {}
