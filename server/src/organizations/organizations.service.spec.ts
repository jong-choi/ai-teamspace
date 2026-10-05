import { Logger } from '@nestjs/common';

import {
  OrganizationMemberNotFoundError,
  OrganizationNotFoundError,
  OwnerTransferRequiredError,
  SelfMemberRemovalNotSupportedError,
  SelfRoleChangeNotSupportedError,
} from '#server/organizations/domain/organization.error.js';
import type { OrganizationMember } from '#server/organizations/domain/organization-member.js';
import { OrganizationRoleSchema } from '#server/organizations/domain/organization-role.js';
import { OrganizationPublicEventPublisher } from '#server/organizations/infrastructure/events/organization-public-event.provider.js';
import {
  type OrganizationActorContext,
  OrganizationProvider,
} from '#server/organizations/infrastructure/organization/organization.provider.js';
import { OrganizationsService } from '#server/organizations/organizations.service.js';

import { jest } from '@jest/globals';

class FakeOrganizationProvider extends OrganizationProvider {
  listForActor = jest.fn<OrganizationProvider['listForActor']>();
  createForActor = jest.fn<OrganizationProvider['createForActor']>();
  getAccess = jest.fn<OrganizationProvider['getAccess']>();
  listMembers = jest.fn<OrganizationProvider['listMembers']>();
  getMember = jest.fn<OrganizationProvider['getMember']>();
  changeMemberRole = jest.fn<OrganizationProvider['changeMemberRole']>();
  removeMember = jest.fn<OrganizationProvider['removeMember']>();
  setActive = jest.fn<OrganizationProvider['setActive']>();
}

class FakeOrganizationPublicEventPublisher extends OrganizationPublicEventPublisher {
  publishAuthorizationChanged =
    jest.fn<OrganizationPublicEventPublisher['publishAuthorizationChanged']>();
}

const context: OrganizationActorContext = {
  userId: 'actor-user',
  activeOrganizationIdCandidate: 'organization-a',
  providerCredential: {},
};

function member(
  input: {
    id?: string;
    organizationId?: string;
    userId?: string;
    role?: OrganizationMember['role'];
  } = {},
): OrganizationMember {
  return {
    id: input.id ?? 'member-a',
    organizationId: input.organizationId ?? 'organization-a',
    userId: input.userId ?? 'target-user',
    role: input.role ?? OrganizationRoleSchema.enum.member,
    createdAt: new Date(0).toISOString(),
    user: {
      id: input.userId ?? 'target-user',
      name: '대상 사용자',
      email: 'target@example.com',
      image: null,
    },
  };
}

function access(role: OrganizationMember['role']) {
  return {
    organization: {
      id: 'organization-a',
      name: '조직 A',
      slug: 'organization-a',
      logo: null,
      createdAt: new Date(0).toISOString(),
    },
    role,
  };
}

describe('조직 서비스', () => {
  let provider: FakeOrganizationProvider;
  let publicEventPublisher: FakeOrganizationPublicEventPublisher;
  let service: OrganizationsService;

  beforeEach(() => {
    provider = new FakeOrganizationProvider();
    publicEventPublisher = new FakeOrganizationPublicEventPublisher();
    service = new OrganizationsService(provider, publicEventPublisher);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('stale active organization은 읽기 중 수정하지 않고 null로 반환한다', async () => {
    provider.getAccess.mockRejectedValue(new OrganizationNotFoundError());

    await expect(service.getActive(context)).resolves.toEqual({
      activeOrganization: null,
    });
    expect(provider.setActive).not.toHaveBeenCalled();
  });

  it('동일 role 요청도 provider에 위임해 Better Auth permission 검사를 유지한다', async () => {
    const target = member();
    provider.getAccess.mockResolvedValue(
      access(OrganizationRoleSchema.enum.owner),
    );
    provider.getMember.mockResolvedValue(target);
    provider.changeMemberRole.mockResolvedValue(target);

    await expect(
      service.changeMemberRole(context, 'organization-a', target.id, {
        role: target.role,
      }),
    ).resolves.toEqual(target);
    expect(provider.changeMemberRole).toHaveBeenCalledWith(
      context,
      'organization-a',
      target,
      target.role,
    );
    expect(
      publicEventPublisher.publishAuthorizationChanged,
    ).toHaveBeenCalledWith({
      organizationId: 'organization-a',
      userId: target.userId,
      reason: 'member-role-changed',
    });
  });

  it('권한 변경이 완료된 뒤 event 발행이 실패해도 mutation 결과를 반환한다', async () => {
    const target = member();
    const updated = member({ role: OrganizationRoleSchema.enum.admin });
    provider.getAccess.mockResolvedValue(
      access(OrganizationRoleSchema.enum.owner),
    );
    provider.getMember.mockResolvedValue(target);
    provider.changeMemberRole.mockResolvedValue(updated);
    publicEventPublisher.publishAuthorizationChanged.mockRejectedValue(
      new Error('queue unavailable'),
    );
    const logger = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);

    await expect(
      service.changeMemberRole(context, 'organization-a', target.id, {
        role: OrganizationRoleSchema.enum.admin,
      }),
    ).resolves.toEqual(updated);
    expect(logger).toHaveBeenCalledWith(
      expect.stringContaining(
        '조직 권한 invalidation event 발행에 실패했습니다',
      ),
      expect.any(Error),
    );
  });

  it('자기 자신의 role 변경은 provider mutation 전에 차단한다', async () => {
    const target = member({ userId: context.userId });
    provider.getAccess.mockResolvedValue(
      access(OrganizationRoleSchema.enum.admin),
    );
    provider.getMember.mockResolvedValue(target);

    await expect(
      service.changeMemberRole(context, 'organization-a', target.id, {
        role: OrganizationRoleSchema.enum.admin,
      }),
    ).rejects.toBeInstanceOf(SelfRoleChangeNotSupportedError);
    expect(provider.changeMemberRole).not.toHaveBeenCalled();
  });

  it('owner target의 generic 강등과 제거는 provider mutation 전에 차단한다', async () => {
    const target = member({ role: OrganizationRoleSchema.enum.owner });
    provider.getAccess.mockResolvedValue(
      access(OrganizationRoleSchema.enum.owner),
    );
    provider.getMember.mockResolvedValue(target);

    await expect(
      service.changeMemberRole(context, 'organization-a', target.id, {
        role: OrganizationRoleSchema.enum.admin,
      }),
    ).rejects.toBeInstanceOf(OwnerTransferRequiredError);
    await expect(
      service.removeMember(context, 'organization-a', target.id),
    ).rejects.toBeInstanceOf(OwnerTransferRequiredError);

    expect(provider.changeMemberRole).not.toHaveBeenCalled();
    expect(provider.removeMember).not.toHaveBeenCalled();
  });

  it('자기 자신 제거는 generic member API에서 차단한다', async () => {
    const target = member({ userId: context.userId });
    provider.getAccess.mockResolvedValue(
      access(OrganizationRoleSchema.enum.member),
    );
    provider.getMember.mockResolvedValue(target);

    await expect(
      service.removeMember(context, 'organization-a', target.id),
    ).rejects.toBeInstanceOf(SelfMemberRemovalNotSupportedError);

    expect(provider.removeMember).not.toHaveBeenCalled();
  });

  it('target organization 범위에 member가 없으면 mutation 없이 not found를 반환한다', async () => {
    provider.getAccess.mockResolvedValue(
      access(OrganizationRoleSchema.enum.owner),
    );
    provider.getMember.mockResolvedValue(null);

    await expect(
      service.changeMemberRole(context, 'organization-a', 'foreign-member', {
        role: OrganizationRoleSchema.enum.admin,
      }),
    ).rejects.toBeInstanceOf(OrganizationMemberNotFoundError);
    expect(provider.changeMemberRole).not.toHaveBeenCalled();
  });
});
