import { Logger } from '@nestjs/common';

import {
  OrganizationAccessDeniedError,
  OrganizationMemberNotFoundError,
  OrganizationNotFoundError,
  OwnerTransferRequiredError,
  SelfMemberRemovalNotSupportedError,
  SelfRoleChangeNotSupportedError,
} from '@/organizations/domain/organization.error';
import type { OrganizationMember } from '@/organizations/domain/organization-member';
import { OrganizationRoleSchema } from '@/organizations/domain/organization-role';
import { OrganizationPublicEventPublisher } from '@/organizations/infrastructure/events/organization-public-event.provider';
import {
  type OrganizationActorContext,
  OrganizationProvider,
} from '@/organizations/infrastructure/organization/organization.provider';
import { OrganizationPublicEventsService } from '@/organizations/organization-public-events.service';
import { OrganizationsService } from '@/organizations/organizations.service';

import { jest } from '@jest/globals';

class FakeOrganizationProvider extends OrganizationProvider {
  listProjectionOrganizationIds() {
    return Promise.resolve([]);
  }
  listExistingProjectionOrganizationIds() {
    return Promise.resolve([]);
  }
  hasProjectionOrganization() {
    return Promise.resolve(false);
  }
  getMembershipProjection =
    jest.fn<OrganizationProvider['getMembershipProjection']>();
  listMembershipProjectionUserIds =
    jest.fn<OrganizationProvider['listMembershipProjectionUserIds']>();
  listForActor = jest.fn<OrganizationProvider['listForActor']>();
  createForActor = jest.fn<OrganizationProvider['createForActor']>();
  getAccess = jest.fn<OrganizationProvider['getAccess']>();
  listMembers = jest.fn<OrganizationProvider['listMembers']>();
  getMember = jest.fn<OrganizationProvider['getMember']>();
  hasMemberUser = jest.fn<OrganizationProvider['hasMemberUser']>();
  listMembersByUserIds =
    jest.fn<OrganizationProvider['listMembersByUserIds']>();
  changeMemberRole = jest.fn<OrganizationProvider['changeMemberRole']>();
  removeMember = jest.fn<OrganizationProvider['removeMember']>();
}

class FakeOrganizationPublicEventPublisher extends OrganizationPublicEventPublisher {
  publishAuthorizationChanged =
    jest.fn<OrganizationPublicEventPublisher['publishAuthorizationChanged']>();
}

const context: OrganizationActorContext = {
  userId: 'actor-user',
  activeOrganizationIdCandidate: 'organization-a',
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
    service = new OrganizationsService(
      provider,
      new OrganizationPublicEventsService(publicEventPublisher),
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('stale active organization은 읽기 중 수정하지 않고 null로 반환한다', async () => {
    provider.getAccess.mockRejectedValue(new OrganizationNotFoundError());

    await expect(service.getActive(context)).resolves.toEqual({
      activeOrganization: null,
    });
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

  it('user id 기반 member 조회는 조직 접근을 확인한 뒤 provider에 위임한다', async () => {
    const members = [member({ userId: 'member-one' })];
    provider.getAccess.mockResolvedValue(
      access(OrganizationRoleSchema.enum.member),
    );
    provider.listMembersByUserIds.mockResolvedValue(members);

    await expect(
      service.listMembersByUserIds(context, 'organization-a', ['member-one']),
    ).resolves.toEqual(members);
    expect(provider.getAccess).toHaveBeenCalledWith(context, 'organization-a');
    expect(provider.listMembersByUserIds).toHaveBeenCalledWith(
      context,
      'organization-a',
      ['member-one'],
    );
  });

  it('member 검색 결과가 여러 페이지면 모든 user id를 이어서 반환한다', async () => {
    const firstPage = Array.from({ length: 100 }, (_, index) =>
      member({ userId: `member-${index}` }),
    );
    const lastMember = member({ userId: 'member-100' });
    provider.getAccess.mockResolvedValue(
      access(OrganizationRoleSchema.enum.member),
    );
    provider.listMembers
      .mockResolvedValueOnce({
        items: firstPage,
        total: 101,
        limit: 100,
        offset: 0,
      })
      .mockResolvedValueOnce({
        items: [lastMember],
        total: 101,
        limit: 100,
        offset: 100,
      });

    const result = await service.searchMemberUserIds(
      context,
      'organization-a',
      'member',
    );

    expect(result).toHaveLength(101);
    expect(result[0]).toBe('member-0');
    expect(result[100]).toBe('member-100');
    expect(provider.listMembers).toHaveBeenNthCalledWith(
      1,
      context,
      'organization-a',
      { limit: 100, offset: 0, search: 'member' },
    );
    expect(provider.listMembers).toHaveBeenNthCalledWith(
      2,
      context,
      'organization-a',
      { limit: 100, offset: 100, search: 'member' },
    );
  });

  it('일반 member의 조직 관리 권한 요청은 public policy 경계에서 거부한다', async () => {
    provider.getAccess.mockResolvedValue(
      access(OrganizationRoleSchema.enum.member),
    );

    await expect(
      service.assertAdministrativeAccess(context, 'organization-a'),
    ).rejects.toBeInstanceOf(OrganizationAccessDeniedError);
  });
});
