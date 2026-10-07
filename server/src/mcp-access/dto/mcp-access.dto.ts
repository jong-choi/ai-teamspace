import { createZodDto } from '@/common/dto/create-zod-dto';
import {
  MCP_SCOPES,
  type McpScope,
  McpScopeSchema,
  McpScopesSchema,
} from '@/mcp/contracts/mcp-scope';
import {
  type McpOrganizationPolicyResponse,
  McpOrganizationPolicyResponseSchema,
  type McpUserPolicyResponse,
  McpUserPolicyResponseSchema,
} from '@/mcp-access/dto/mcp-policy.dto';

import { z } from 'zod';

export const McpPolicyRestrictionReasonSchema = z.enum([
  'deployment_ceiling',
  'organization_policy',
  'user_policy',
]);

export const McpCapabilitySchema = z
  .object({
    scope: McpScopeSchema,
    feature: z.string().min(1),
    action: z.enum(['read', 'write']),
    requested: z.boolean(),
    organizationAllowed: z.boolean(),
    effective: z.boolean(),
    restrictionReason: McpPolicyRestrictionReasonSchema.nullable(),
  })
  .meta({ id: 'McpCapability' });

export const McpEffectiveAccessSchema = z
  .object({
    effectiveScopes: McpScopesSchema,
    capabilities: z.array(McpCapabilitySchema),
  })
  .meta({ id: 'McpEffectiveAccess' });

export const McpAccessCompositeSchema = z
  .object({
    organizationId: z.string().min(1),
    organizationPolicy: McpOrganizationPolicyResponseSchema,
    myPolicy: McpUserPolicyResponseSchema,
    effectiveScopes: McpScopesSchema,
    canManageOrganizationPolicy: z.boolean(),
    capabilities: z.array(McpCapabilitySchema),
  })
  .meta({ id: 'McpAccessComposite' });

export type McpCapability = z.infer<typeof McpCapabilitySchema>;
export type McpEffectiveAccess = z.infer<typeof McpEffectiveAccessSchema>;
export type McpAccessCompositeResponse = z.infer<
  typeof McpAccessCompositeSchema
>;

export function toMcpEffectiveAccess(input: {
  deploymentScopes: readonly McpScope[];
  organizationAllowedScopes: readonly McpScope[];
  userRequestedScopes: readonly McpScope[];
}): McpEffectiveAccess {
  const deployment = new Set(input.deploymentScopes);
  const organizationAllowed = new Set(input.organizationAllowedScopes);
  const requested = new Set(input.userRequestedScopes);

  const capabilities = MCP_SCOPES.map((scope) => {
    const deploymentAvailable = deployment.has(scope);
    const organizationAllows = organizationAllowed.has(scope);
    const userRequests = requested.has(scope);
    const effective = deploymentAvailable && organizationAllows && userRequests;

    return {
      scope,
      ...splitScope(scope),
      requested: userRequests,
      organizationAllowed: organizationAllows,
      effective,
      restrictionReason: !deploymentAvailable
        ? ('deployment_ceiling' as const)
        : !organizationAllows
          ? ('organization_policy' as const)
          : !userRequests
            ? ('user_policy' as const)
            : null,
    };
  });

  return McpEffectiveAccessSchema.parse({
    effectiveScopes: capabilities
      .filter((capability) => capability.effective)
      .map((capability) => capability.scope),
    capabilities,
  });
}

export function toMcpAccessCompositeResponse(input: {
  organizationId: string;
  organizationPolicy: McpOrganizationPolicyResponse;
  myPolicy: McpUserPolicyResponse;
  canManageOrganizationPolicy: boolean;
  effectiveAccess: McpEffectiveAccess;
}): McpAccessCompositeResponse {
  return McpAccessCompositeSchema.parse({
    organizationId: input.organizationId,
    organizationPolicy: input.organizationPolicy,
    myPolicy: input.myPolicy,
    effectiveScopes: input.effectiveAccess.effectiveScopes,
    canManageOrganizationPolicy: input.canManageOrganizationPolicy,
    capabilities: input.effectiveAccess.capabilities,
  });
}

function splitScope(scope: McpScope): {
  feature: string;
  action: 'read' | 'write';
} {
  const separator = scope.lastIndexOf(':');
  const feature = scope.slice(0, separator);
  const action = scope.slice(separator + 1);

  if (feature.length === 0 || (action !== 'read' && action !== 'write')) {
    throw new Error(`유효하지 않은 canonical MCP scope입니다: ${scope}`);
  }

  return { feature, action };
}

export class McpEffectiveAccessDto extends createZodDto(
  McpEffectiveAccessSchema,
) {}

export class McpAccessCompositeDto extends createZodDto(
  McpAccessCompositeSchema,
) {}
