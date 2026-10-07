import { Inject, Injectable } from '@nestjs/common';

import type { McpAuthContext } from '@/mcp/contracts/mcp-auth-context';
import { MCP_SCOPES, type McpScope } from '@/mcp/contracts/mcp-scope';
import {
  McpOrganizationMembershipRequiredError,
  McpOrganizationPolicyForbiddenError,
  McpPolicyNotProvisionedError,
  McpPolicyRevisionConflictError,
  McpScopeNotAllowedByOrganizationError,
} from '@/mcp-access/domain/mcp-access.error';
import {
  evaluateMcpAccessDecision,
  type McpAccessDecision,
} from '@/mcp-access/domain/mcp-access-decision';
import {
  type McpAccessCompositeResponse,
  toMcpAccessCompositeResponse,
  toMcpEffectiveAccess,
} from '@/mcp-access/dto/mcp-access.dto';
import {
  toMcpOrganizationPolicyResponse,
  toMcpUserPolicyResponse,
} from '@/mcp-access/dto/mcp-policy.dto';
import type {
  UpdateMcpOrganizationPolicyInput,
  UpdateMcpUserPolicyInput,
} from '@/mcp-access/dto/update-mcp-policy.dto';
import { McpAccessRepository } from '@/mcp-access/infrastructure/persistence/mcp-access.repository';
import {
  getDefaultOrganizationMcpScopes,
  getDefaultUserMcpScopes,
} from '@/mcp-access/mcp-policy-defaults';
import { OrganizationAccessDeniedError } from '@/organizations/domain/organization.error';
import type { OrganizationAuthorizationChangedEvent } from '@/organizations/domain/organization-public-event';
import type { OrganizationActorContext } from '@/organizations/organization-actor-context';
import { OrganizationMembershipService } from '@/organizations/organization-membership.service';
import { OrganizationsService } from '@/organizations/organizations.service';

@Injectable()
export class McpAccessService {
  constructor(
    private readonly repository: McpAccessRepository,
    @Inject(OrganizationsService)
    private readonly organizationsService: Pick<
      OrganizationsService,
      'assertAdministrativeAccess'
    >,
    @Inject(OrganizationMembershipService)
    private readonly membershipService: Pick<
      OrganizationMembershipService,
      'requireAccess' | 'hasMemberUser'
    >,
  ) {}

  async getComposite(
    actor: OrganizationActorContext,
    organizationId: string,
  ): Promise<McpAccessCompositeResponse> {
    await this.membershipService.requireAccess(actor, organizationId);

    const organizationPolicy =
      await this.ensureOrganizationPolicy(organizationId);
    const userPolicy = await this.ensureUserPolicy(
      organizationId,
      actor.userId,
      organizationPolicy.allowedScopes,
    );
    const canManageOrganizationPolicy = await this.canManageOrganizationPolicy(
      actor,
      organizationId,
    );
    const effectiveAccess = toMcpEffectiveAccess({
      deploymentScopes: MCP_SCOPES,
      organizationAllowedScopes: organizationPolicy.allowedScopes,
      userRequestedScopes: userPolicy.requestedScopes,
    });

    return toMcpAccessCompositeResponse({
      organizationId,
      organizationPolicy: toMcpOrganizationPolicyResponse(organizationPolicy),
      myPolicy: toMcpUserPolicyResponse(userPolicy),
      canManageOrganizationPolicy,
      effectiveAccess,
    });
  }

  async updateMyPolicy(
    actor: OrganizationActorContext,
    organizationId: string,
    input: UpdateMcpUserPolicyInput,
  ): Promise<McpAccessCompositeResponse> {
    await this.membershipService.requireAccess(actor, organizationId);

    const organizationPolicy =
      await this.ensureOrganizationPolicy(organizationId);
    await this.ensureUserPolicy(
      organizationId,
      actor.userId,
      organizationPolicy.allowedScopes,
    );

    const allowed = new Set<McpScope>(organizationPolicy.allowedScopes);
    if (input.requestedScopes.some((scope) => !allowed.has(scope))) {
      throw new McpScopeNotAllowedByOrganizationError();
    }

    const result = await this.repository.updateUserPolicyIfRevision({
      organizationId,
      userId: actor.userId,
      requestedScopes: input.requestedScopes,
      expectedRevision: input.expectedRevision,
    });
    this.assertPolicyUpdateSucceeded(result);

    return this.getComposite(actor, organizationId);
  }

  async updateOrganizationPolicy(
    actor: OrganizationActorContext,
    organizationId: string,
    input: UpdateMcpOrganizationPolicyInput,
  ): Promise<McpAccessCompositeResponse> {
    await this.assertOrganizationPolicyAdministrativeAccess(
      actor,
      organizationId,
    );
    await this.ensureOrganizationPolicy(organizationId);

    const result = await this.repository.updateOrganizationPolicyAndPruneUsers({
      organizationId,
      allowedScopes: input.allowedScopes,
      expectedRevision: input.expectedRevision,
      updatedByUserId: actor.userId,
    });
    this.assertPolicyUpdateSucceeded(result);

    return this.getComposite(actor, organizationId);
  }

  async evaluate(input: {
    auth: McpAuthContext;
    organizationId: string;
    requiredScope: McpScope;
    deploymentScopes: readonly McpScope[];
  }): Promise<McpAccessDecision<McpScope>> {
    const policies = await this.repository.findComposite(
      input.organizationId,
      input.auth.userId,
    );
    if (!policies.organizationPolicy || !policies.userPolicy) {
      throw new McpPolicyNotProvisionedError();
    }

    const hasMembership = await this.membershipService.hasMemberUser(
      input.organizationId,
      input.auth.userId,
    );

    return evaluateMcpAccessDecision({
      requiredScope: input.requiredScope,
      deploymentScopes: input.deploymentScopes,
      credentialScopes: input.auth.scopes,
      credentialOrganizationIds: input.auth.allowedOrganizationIds,
      organizationId: input.organizationId,
      organizationAllowedScopes: policies.organizationPolicy.allowedScopes,
      userRequestedScopes: policies.userPolicy.requestedScopes,
      hasMembership,
    });
  }

  ensureOrganizationPolicy(
    organizationId: string,
    actorUserId: string | null = null,
  ) {
    return this.repository.ensureOrganizationPolicy({
      organizationId,
      allowedScopes: getDefaultOrganizationMcpScopes(),
      updatedByUserId: actorUserId,
    });
  }

  async ensureUserPolicy(
    organizationId: string,
    userId: string,
    organizationAllowedScopes?: readonly McpScope[],
  ) {
    const allowedScopes =
      organizationAllowedScopes ??
      (await this.ensureOrganizationPolicy(organizationId)).allowedScopes;

    return this.repository.ensureUserPolicy({
      organizationId,
      userId,
      requestedScopes: getDefaultUserMcpScopes(allowedScopes),
    });
  }

  private async canManageOrganizationPolicy(
    actor: OrganizationActorContext,
    organizationId: string,
  ): Promise<boolean> {
    try {
      await this.organizationsService.assertAdministrativeAccess(
        actor,
        organizationId,
      );
      return true;
    } catch (error) {
      if (error instanceof OrganizationAccessDeniedError) return false;
      throw error;
    }
  }

  private async assertOrganizationPolicyAdministrativeAccess(
    actor: OrganizationActorContext,
    organizationId: string,
  ): Promise<void> {
    try {
      await this.organizationsService.assertAdministrativeAccess(
        actor,
        organizationId,
      );
    } catch (error) {
      if (error instanceof OrganizationAccessDeniedError) {
        throw new McpOrganizationPolicyForbiddenError({ cause: error });
      }
      throw error;
    }
  }

  private assertPolicyUpdateSucceeded(
    result:
      | Awaited<ReturnType<McpAccessRepository['updateUserPolicyIfRevision']>>
      | Awaited<
          ReturnType<
            McpAccessRepository['updateOrganizationPolicyAndPruneUsers']
          >
        >,
  ): void {
    if (result.status === 'revision_conflict') {
      throw new McpPolicyRevisionConflictError();
    }
    if (result.status === 'not_found') {
      throw new McpPolicyNotProvisionedError();
    }
  }

  async handleOrganizationAuthorizationChanged(
    event: OrganizationAuthorizationChangedEvent,
  ): Promise<'deleted' | 'ensured'> {
    return this.reconcileUserPolicyMembership(
      event.organizationId,
      event.userId,
    );
  }

  async reconcileUserPolicyMembership(
    organizationId: string,
    userId: string,
  ): Promise<'deleted' | 'ensured'> {
    const hasMembership = await this.membershipService.hasMemberUser(
      organizationId,
      userId,
    );

    if (!hasMembership) {
      await this.repository.deleteUserPolicy(organizationId, userId);
      return 'deleted';
    }

    const organizationPolicy =
      await this.ensureOrganizationPolicy(organizationId);
    await this.ensureUserPolicy(
      organizationId,
      userId,
      organizationPolicy.allowedScopes,
    );
    return 'ensured';
  }

  async assertMembership(
    organizationId: string,
    userId: string,
  ): Promise<void> {
    if (!(await this.membershipService.hasMemberUser(organizationId, userId))) {
      throw new McpOrganizationMembershipRequiredError();
    }
  }
}
