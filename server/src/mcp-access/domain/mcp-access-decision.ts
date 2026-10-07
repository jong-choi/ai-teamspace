export type McpAccessDenialReason =
  | 'deployment_ceiling'
  | 'credential_scope'
  | 'organization_grant'
  | 'organization_policy'
  | 'user_policy'
  | 'membership';

export type McpAccessDecision<TScope extends string = string> =
  | {
      allowed: true;
      requiredScope: TScope;
    }
  | {
      allowed: false;
      requiredScope: TScope;
      reason: McpAccessDenialReason;
    };

export type McpAccessDecisionFacts<TScope extends string = string> = {
  requiredScope: TScope;
  deploymentScopes: readonly TScope[];
  credentialScopes: readonly TScope[];
  credentialOrganizationIds: readonly string[] | null;
  organizationId: string;
  organizationAllowedScopes: readonly TScope[];
  userRequestedScopes: readonly TScope[];
  hasMembership: boolean;
};

export function evaluateMcpAccessDecision<TScope extends string>(
  facts: McpAccessDecisionFacts<TScope>,
): McpAccessDecision<TScope> {
  const requiredScope = facts.requiredScope;

  if (!facts.deploymentScopes.includes(requiredScope)) {
    return deny(requiredScope, 'deployment_ceiling');
  }
  if (!facts.credentialScopes.includes(requiredScope)) {
    return deny(requiredScope, 'credential_scope');
  }
  if (
    facts.credentialOrganizationIds !== null &&
    !facts.credentialOrganizationIds.includes(facts.organizationId)
  ) {
    return deny(requiredScope, 'organization_grant');
  }
  if (!facts.organizationAllowedScopes.includes(requiredScope)) {
    return deny(requiredScope, 'organization_policy');
  }
  if (!facts.userRequestedScopes.includes(requiredScope)) {
    return deny(requiredScope, 'user_policy');
  }
  if (!facts.hasMembership) {
    return deny(requiredScope, 'membership');
  }

  return { allowed: true, requiredScope };
}

function deny<TScope extends string>(
  requiredScope: TScope,
  reason: McpAccessDenialReason,
): McpAccessDecision<TScope> {
  return { allowed: false, requiredScope, reason };
}
