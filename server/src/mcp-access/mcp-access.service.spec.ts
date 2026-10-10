import {
  McpOrganizationPolicyForbiddenError,
  McpPolicyNotProvisionedError,
  McpPolicyRevisionConflictError,
  McpScopeNotAllowedByOrganizationError,
} from '@/mcp-access/domain/mcp-access.error';
import type { McpOrganizationPolicy } from '@/mcp-access/domain/mcp-organization-policy';
import type { McpUserPolicy } from '@/mcp-access/domain/mcp-user-policy';
import { McpPolicyAuditPublisher } from '@/mcp-access/infrastructure/audit/mcp-policy-audit.publisher';
import { McpAccessRepository } from '@/mcp-access/infrastructure/persistence/mcp-access.repository';
import { McpAccessService } from '@/mcp-access/mcp-access.service';
import { OrganizationAccessDeniedError } from '@/organizations/domain/organization.error';
import type { OrganizationActorContext } from '@/organizations/organization-actor-context';
import { OrganizationMembershipService } from '@/organizations/organization-membership.service';
import { OrganizationsService } from '@/organizations/organizations.service';

import { jest } from '@jest/globals';

class FakeMcpAccessRepository extends McpAccessRepository {
  findComposite = jest.fn<McpAccessRepository['findComposite']>();
  findOrganizationPolicy =
    jest.fn<McpAccessRepository['findOrganizationPolicy']>();
  findUserPolicy = jest.fn<McpAccessRepository['findUserPolicy']>();
  ensureOrganizationPolicy =
    jest.fn<McpAccessRepository['ensureOrganizationPolicy']>();
  ensureUserPolicy = jest.fn<McpAccessRepository['ensureUserPolicy']>();
  updateUserPolicyIfRevision =
    jest.fn<McpAccessRepository['updateUserPolicyIfRevision']>();
  updateOrganizationPolicyAndPruneUsers =
    jest.fn<McpAccessRepository['updateOrganizationPolicyAndPruneUsers']>();
  deleteUserPolicy = jest.fn<McpAccessRepository['deleteUserPolicy']>();
}

const actor: OrganizationActorContext = {
  userId: 'user-a',
  activeOrganizationIdCandidate: 'org-a',
};

const organizationAccess = {
  organization: {
    id: 'org-a',
    name: '조직 A',
    slug: 'org-a',
    logo: null,
    createdAt: new Date(0).toISOString(),
  },
  role: 'member' as const,
};

function organizationPolicy(
  overrides: Partial<McpOrganizationPolicy> = {},
): McpOrganizationPolicy {
  return {
    organizationId: 'org-a',
    allowedScopes: ['organizations:read', 'wiki:read'],
    revision: 0,
    updatedByUserId: null,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...overrides,
  };
}

function userPolicy(overrides: Partial<McpUserPolicy> = {}): McpUserPolicy {
  return {
    organizationId: 'org-a',
    userId: 'user-a',
    requestedScopes: ['organizations:read', 'wiki:read'],
    revision: 0,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...overrides,
  };
}

describe('McpAccessService', () => {
  let repository: FakeMcpAccessRepository;
  let organizationsService: Pick<
    OrganizationsService,
    'assertAdministrativeAccess'
  >;
  let membershipService: Pick<
    OrganizationMembershipService,
    'requireAccess' | 'hasMemberUser'
  >;
  let assertAdministrativeAccessMock: ReturnType<
    typeof jest.fn<OrganizationsService['assertAdministrativeAccess']>
  >;
  let requireAccessMock: ReturnType<
    typeof jest.fn<OrganizationMembershipService['requireAccess']>
  >;
  let hasMemberUserMock: ReturnType<
    typeof jest.fn<OrganizationMembershipService['hasMemberUser']>
  >;
  let auditPublisher: McpPolicyAuditPublisher;
  let auditPublishMock: jest.MockedFunction<McpPolicyAuditPublisher['publish']>;
  let service: McpAccessService;

  beforeEach(() => {
    repository = new FakeMcpAccessRepository();
    assertAdministrativeAccessMock =
      jest.fn<OrganizationsService['assertAdministrativeAccess']>();
    requireAccessMock =
      jest.fn<OrganizationMembershipService['requireAccess']>();
    hasMemberUserMock =
      jest.fn<OrganizationMembershipService['hasMemberUser']>();

    organizationsService = {
      assertAdministrativeAccess: assertAdministrativeAccessMock,
    };
    membershipService = {
      requireAccess: requireAccessMock,
      hasMemberUser: hasMemberUserMock,
    };
    auditPublishMock = jest.fn<McpPolicyAuditPublisher['publish']>();
    auditPublisher = { publish: auditPublishMock };
    service = new McpAccessService(
      repository,
      organizationsService,
      membershipService,
      auditPublisher,
    );

    requireAccessMock.mockResolvedValue(organizationAccess);
    hasMemberUserMock.mockResolvedValue(true);
    repository.findOrganizationPolicy.mockResolvedValue(organizationPolicy());
    repository.findUserPolicy.mockResolvedValue(userPolicy());
    repository.ensureOrganizationPolicy.mockResolvedValue({
      value: organizationPolicy(),
      created: false,
    });
    repository.ensureUserPolicy.mockResolvedValue({
      value: userPolicy(),
      created: false,
    });
  });

  it('일반 멤버에게 정책 composite를 conservative defaults로 materialize한다', async () => {
    assertAdministrativeAccessMock.mockRejectedValue(
      new OrganizationAccessDeniedError(),
    );
    repository.ensureOrganizationPolicy.mockResolvedValue({
      value: organizationPolicy(),
      created: true,
    });
    repository.ensureUserPolicy.mockResolvedValue({
      value: userPolicy(),
      created: true,
    });

    await expect(service.getComposite(actor, 'org-a')).resolves.toMatchObject({
      organizationId: 'org-a',
      organizationPolicy: {
        allowedScopes: ['organizations:read', 'wiki:read'],
        revision: 0,
      },
      myPolicy: {
        requestedScopes: ['organizations:read', 'wiki:read'],
        revision: 0,
      },
      effectiveScopes: ['organizations:read', 'wiki:read'],
      canManageOrganizationPolicy: false,
    });
    expect(auditPublishMock).toHaveBeenCalledTimes(2);
    expect(auditPublishMock).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'mcp.policy.provisioned',
        reason: 'system_provisioned',
        actorUserId: null,
        organizationId: 'org-a',
      }),
    );
  });

  it('organization ceiling 밖 개인 scope 요청을 repository update 전에 거부한다', async () => {
    await expect(
      service.updateMyPolicy(actor, 'org-a', {
        requestedScopes: ['wiki:read', 'wiki:write'],
        expectedRevision: 0,
      }),
    ).rejects.toBeInstanceOf(McpScopeNotAllowedByOrganizationError);

    expect(repository.updateUserPolicyIfRevision).not.toHaveBeenCalled();
  });

  it('repository revision conflict를 canonical application error로 변환한다', async () => {
    repository.updateUserPolicyIfRevision.mockResolvedValue({
      status: 'revision_conflict',
      currentRevision: 2,
    });

    await expect(
      service.updateMyPolicy(actor, 'org-a', {
        requestedScopes: ['wiki:read'],
        expectedRevision: 1,
      }),
    ).rejects.toBeInstanceOf(McpPolicyRevisionConflictError);
  });

  it('non-admin organization policy update를 repository 호출 전에 거부한다', async () => {
    assertAdministrativeAccessMock.mockRejectedValue(
      new OrganizationAccessDeniedError(),
    );

    await expect(
      service.updateOrganizationPolicy(actor, 'org-a', {
        allowedScopes: ['organizations:read', 'wiki:read'],
        expectedRevision: 0,
      }),
    ).rejects.toBeInstanceOf(McpOrganizationPolicyForbiddenError);

    expect(
      repository.updateOrganizationPolicyAndPruneUsers,
    ).not.toHaveBeenCalled();
  });

  it('organization policy revision conflict도 canonical application error로 변환한다', async () => {
    repository.updateOrganizationPolicyAndPruneUsers.mockResolvedValue({
      status: 'revision_conflict',
      currentRevision: 4,
    });

    await expect(
      service.updateOrganizationPolicy(actor, 'org-a', {
        allowedScopes: ['organizations:read', 'wiki:read'],
        expectedRevision: 3,
      }),
    ).rejects.toBeInstanceOf(McpPolicyRevisionConflictError);
  });

  it('organization policy human update에 actor user id를 audit authority로 전달한다', async () => {
    repository.updateOrganizationPolicyAndPruneUsers.mockResolvedValue({
      status: 'updated',
      value: {
        policy: organizationPolicy({
          allowedScopes: ['organizations:read'],
          revision: 1,
          updatedByUserId: 'user-a',
        }),
        affectedUserCount: 1,
      },
    });

    await service.updateOrganizationPolicy(actor, 'org-a', {
      allowedScopes: ['organizations:read'],
      expectedRevision: 0,
    });

    expect(
      repository.updateOrganizationPolicyAndPruneUsers,
    ).toHaveBeenCalledWith({
      organizationId: 'org-a',
      allowedScopes: ['organizations:read'],
      expectedRevision: 0,
      updatedByUserId: 'user-a',
    });
    expect(auditPublishMock).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'mcp.policy.organization.updated',
        reason: 'human_update',
        actorUserId: 'user-a',
        organizationId: 'org-a',
        priorRevision: 0,
        nextRevision: 1,
        removedScopes: ['wiki:read'],
        affectedUserCount: 1,
      }),
    );
    expect(auditPublishMock).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'mcp.policy.user.pruned',
        removedScopes: ['wiki:read'],
        affectedUserCount: 1,
      }),
    );
  });

  it('semantic no-op user update에는 changed audit event를 남기지 않는다', async () => {
    repository.updateUserPolicyIfRevision.mockResolvedValue({
      status: 'updated',
      value: userPolicy(),
    });

    await service.updateMyPolicy(actor, 'org-a', {
      requestedScopes: ['organizations:read', 'wiki:read'],
      expectedRevision: 0,
    });

    expect(auditPublishMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ name: 'mcp.policy.user.updated' }),
    );
  });

  it('live evaluator는 current membership을 매 호출 다시 확인한다', async () => {
    repository.findComposite.mockResolvedValue({
      organizationPolicy: organizationPolicy({
        allowedScopes: ['wiki:read', 'wiki:write'],
      }),
      userPolicy: userPolicy({
        requestedScopes: ['wiki:read', 'wiki:write'],
      }),
    });
    hasMemberUserMock.mockResolvedValue(false);

    await expect(
      service.evaluate({
        auth: {
          authMethod: 'oauth',
          credentialId: 'credential-a',
          userId: 'user-a',
          clientId: 'client-a',
          scopes: ['wiki:read', 'wiki:write'],
          allowedOrganizationIds: ['org-a'],
        },
        organizationId: 'org-a',
        requiredScope: 'wiki:write',
        deploymentScopes: ['wiki:read', 'wiki:write'],
      }),
    ).resolves.toEqual({
      allowed: false,
      requiredScope: 'wiki:write',
      reason: 'membership',
    });
  });

  it('membership removal event를 idempotent user policy cleanup으로 변환한다', async () => {
    hasMemberUserMock.mockResolvedValue(false);

    await expect(
      service.handleOrganizationAuthorizationChanged({
        organizationId: 'org-a',
        userId: 'user-a',
        reason: 'member-removed',
      }),
    ).resolves.toBe('deleted');

    expect(repository.deleteUserPolicy).toHaveBeenCalledWith('org-a', 'user-a');
    expect(repository.ensureOrganizationPolicy).not.toHaveBeenCalled();
    expect(repository.ensureUserPolicy).not.toHaveBeenCalled();
    expect(auditPublishMock).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'mcp.policy.user.pruned',
        reason: 'membership_removed',
        subjectUserId: 'user-a',
        removedScopes: ['organizations:read', 'wiki:read'],
      }),
    );
  });

  it('제거 후 재가입 reconciliation은 과거 policy를 복원하지 않고 기본값을 다시 ensure한다', async () => {
    hasMemberUserMock.mockResolvedValueOnce(false).mockResolvedValueOnce(true);

    await expect(
      service.reconcileUserPolicyMembership('org-a', 'user-a'),
    ).resolves.toBe('deleted');
    await expect(
      service.reconcileUserPolicyMembership('org-a', 'user-a'),
    ).resolves.toBe('ensured');

    expect(repository.deleteUserPolicy).toHaveBeenCalledWith('org-a', 'user-a');
    expect(repository.ensureOrganizationPolicy).toHaveBeenCalledWith({
      organizationId: 'org-a',
      allowedScopes: expect.any(Array),
      updatedByUserId: null,
    });
    expect(repository.ensureUserPolicy).toHaveBeenCalledWith({
      organizationId: 'org-a',
      userId: 'user-a',
      requestedScopes: [
        'organizations:read',
        'chat:read',
        'chat:write',
        'wiki:read',
      ],
    });
  });

  it('live evaluator는 missing policy를 자동 broad allow로 materialize하지 않는다', async () => {
    repository.findComposite.mockResolvedValue({
      organizationPolicy: null,
      userPolicy: null,
    });

    await expect(
      service.evaluate({
        auth: {
          authMethod: 'api-key',
          credentialId: 'key-a',
          userId: 'user-a',
          clientId: null,
          scopes: ['wiki:read'],
          allowedOrganizationIds: null,
        },
        organizationId: 'org-a',
        requiredScope: 'wiki:read',
        deploymentScopes: ['wiki:read'],
      }),
    ).rejects.toBeInstanceOf(McpPolicyNotProvisionedError);

    expect(repository.ensureOrganizationPolicy).not.toHaveBeenCalled();
  });
});
