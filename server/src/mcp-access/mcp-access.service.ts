import { randomUUID } from 'node:crypto';

import { Inject, Injectable, Optional } from '@nestjs/common';

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
import {
  type McpPolicyAuditEvent,
  McpPolicyAuditPublisher,
  type McpPolicyAuditReason,
} from '@/mcp-access/infrastructure/audit/mcp-policy-audit.publisher';
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
    @Optional()
    private readonly auditPublisher?: McpPolicyAuditPublisher,
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
    const currentUserPolicy = await this.ensureUserPolicy(
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
    if (
      result.status === 'updated' &&
      result.value.revision !== currentUserPolicy.revision
    ) {
      await this.publishAudit({
        name: 'mcp.policy.user.updated',
        reason: 'human_update',
        actorUserId: actor.userId,
        organizationId,
        subjectUserId: actor.userId,
        priorRevision: currentUserPolicy.revision,
        nextRevision: result.value.revision,
        addedScopes: scopeDifference(
          result.value.requestedScopes,
          currentUserPolicy.requestedScopes,
        ),
        removedScopes: scopeDifference(
          currentUserPolicy.requestedScopes,
          result.value.requestedScopes,
        ),
        affectedUserCount: 1,
      });
    }

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
    const currentOrganizationPolicy =
      await this.ensureOrganizationPolicy(organizationId);

    const result = await this.repository.updateOrganizationPolicyAndPruneUsers({
      organizationId,
      allowedScopes: input.allowedScopes,
      expectedRevision: input.expectedRevision,
      updatedByUserId: actor.userId,
    });
    this.assertPolicyUpdateSucceeded(result);
    if (
      result.status === 'updated' &&
      result.value.policy.revision !== currentOrganizationPolicy.revision
    ) {
      const addedScopes = scopeDifference(
        result.value.policy.allowedScopes,
        currentOrganizationPolicy.allowedScopes,
      );
      const removedScopes = scopeDifference(
        currentOrganizationPolicy.allowedScopes,
        result.value.policy.allowedScopes,
      );
      await this.publishAudit({
        name: 'mcp.policy.organization.updated',
        reason: 'human_update',
        actorUserId: actor.userId,
        organizationId,
        priorRevision: currentOrganizationPolicy.revision,
        nextRevision: result.value.policy.revision,
        addedScopes,
        removedScopes,
        affectedUserCount: result.value.affectedUserCount,
      });
      if (result.value.affectedUserCount > 0) {
        await this.publishAudit({
          name: 'mcp.policy.user.pruned',
          reason: 'human_update',
          actorUserId: actor.userId,
          organizationId,
          priorRevision: null,
          nextRevision: null,
          addedScopes: [],
          removedScopes,
          affectedUserCount: result.value.affectedUserCount,
        });
      }
    }

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

  async ensureOrganizationPolicy(
    organizationId: string,
    actorUserId: string | null = null,
  ) {
    const result = await this.repository.ensureOrganizationPolicy({
      organizationId,
      allowedScopes: getDefaultOrganizationMcpScopes(),
      updatedByUserId: actorUserId,
    });
    const policy = result.value;

    if (result.created) {
      await this.publishAudit({
        name: 'mcp.policy.provisioned',
        reason: 'system_provisioned',
        actorUserId: null,
        organizationId,
        priorRevision: null,
        nextRevision: policy.revision,
        addedScopes: policy.allowedScopes,
        removedScopes: [],
        affectedUserCount: 0,
      });
    }

    return policy;
  }

  async ensureUserPolicy(
    organizationId: string,
    userId: string,
    organizationAllowedScopes?: readonly McpScope[],
  ) {
    const allowedScopes =
      organizationAllowedScopes ??
      (await this.ensureOrganizationPolicy(organizationId)).allowedScopes;
    const result = await this.repository.ensureUserPolicy({
      organizationId,
      userId,
      requestedScopes: getDefaultUserMcpScopes(allowedScopes),
    });
    const policy = result.value;

    if (result.created) {
      await this.publishAudit({
        name: 'mcp.policy.provisioned',
        reason: 'system_provisioned',
        actorUserId: null,
        organizationId,
        subjectUserId: userId,
        priorRevision: null,
        nextRevision: policy.revision,
        addedScopes: policy.requestedScopes,
        removedScopes: [],
        affectedUserCount: 1,
      });
    }

    return policy;
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
      event.reason === 'member-removed'
        ? 'membership_removed'
        : 'reconciliation',
    );
  }

  async reconcileUserPolicyMembership(
    organizationId: string,
    userId: string,
    reason: McpPolicyAuditReason = 'reconciliation',
  ): Promise<'deleted' | 'ensured'> {
    const hasMembership = await this.membershipService.hasMemberUser(
      organizationId,
      userId,
    );

    if (!hasMembership) {
      const existing = await this.repository.findUserPolicy(
        organizationId,
        userId,
      );
      await this.repository.deleteUserPolicy(organizationId, userId);
      if (existing) {
        await this.publishAudit({
          name: 'mcp.policy.user.pruned',
          reason,
          actorUserId: null,
          organizationId,
          subjectUserId: userId,
          priorRevision: existing.revision,
          nextRevision: null,
          addedScopes: [],
          removedScopes: existing.requestedScopes,
          affectedUserCount: 1,
        });
      }
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

  /**
   * 별도 연결 동의 없이 동작하는 built-in Agent의 실효 scope를 계산한다.
   * 멤버십을 먼저 확인하고 기존 기본값으로만 정책을 보장하므로 허용 범위를 늘리지 않는다.
   */
  async resolveFirstPartyAgentScopes(
    organizationId: string,
    userId: string,
  ): Promise<McpScope[]> {
    await this.assertMembership(organizationId, userId);

    const organizationPolicy =
      await this.ensureOrganizationPolicy(organizationId);
    const userPolicy = await this.ensureUserPolicy(
      organizationId,
      userId,
      organizationPolicy.allowedScopes,
    );

    return toMcpEffectiveAccess({
      deploymentScopes: MCP_SCOPES,
      organizationAllowedScopes: organizationPolicy.allowedScopes,
      userRequestedScopes: userPolicy.requestedScopes,
    }).effectiveScopes;
  }

  async assertMembership(
    organizationId: string,
    userId: string,
  ): Promise<void> {
    if (!(await this.membershipService.hasMemberUser(organizationId, userId))) {
      throw new McpOrganizationMembershipRequiredError();
    }
  }

  private async publishAudit(
    event: Omit<McpPolicyAuditEvent, 'correlationId' | 'resultCode'>,
  ): Promise<void> {
    await this.auditPublisher?.publish({
      ...event,
      resultCode: 'ok',
      correlationId: randomUUID(),
    });
  }
}

function scopeDifference(
  left: readonly McpScope[],
  right: readonly McpScope[],
): McpScope[] {
  const rightSet = new Set<McpScope>(right);
  return left.filter((scope) => !rightSet.has(scope));
}
