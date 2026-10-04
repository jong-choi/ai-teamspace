import type { AuthUserDirectoryService } from '#server/auth/auth-user-directory.service.js';
import type { ChatService } from '#server/chat/chat.service.js';
import {
  OrganizationInvitationCompensationFailureError,
  OrganizationInvitationDeliveryFailureError,
  OrganizationInvitationUnavailableError,
  OrganizationMemberNotFoundError,
  OrganizationNotFoundError,
  OwnerTransferRequiredError,
  SelfMemberRemovalNotSupportedError,
  SelfRoleChangeNotSupportedError,
} from '#server/organizations/domain/organization.error.js';
import type { OrganizationInvitation } from '#server/organizations/domain/organization-invitation.js';
import type { OrganizationMember } from '#server/organizations/domain/organization-member.js';
import { OrganizationRoleSchema } from '#server/organizations/domain/organization-role.js';
import { OrganizationInvitationProvider } from '#server/organizations/infrastructure/invitation/organization-invitation.provider.js';
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

class FakeOrganizationInvitationProvider extends OrganizationInvitationProvider {
  create = jest.fn<OrganizationInvitationProvider['create']>();
  cancel = jest.fn<OrganizationInvitationProvider['cancel']>();
}

class FakeAuthUserDirectory {
  resolveExactUsername =
    jest.fn<AuthUserDirectoryService['resolveExactUsername']>();
}

class FakeInvitationDelivery {
  deliverOrganizationInvitation =
    jest.fn<ChatService['deliverOrganizationInvitation']>();
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

function invitation(): OrganizationInvitation {
  return {
    id: 'invitation-a',
    organizationId: 'organization-a',
    email: 'recipient@example.com',
    role: OrganizationRoleSchema.enum.member,
    status: 'pending',
    inviterId: context.userId,
    expiresAt: new Date('2026-10-06T00:00:00.000Z'),
    createdAt: new Date('2026-10-05T00:00:00.000Z'),
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

function recipient() {
  return {
    id: 'recipient-user',
    email: 'recipient@example.com',
    name: '수신자',
    username: 'recipient',
    image: null,
  };
}

describe('조직 서비스', () => {
  let provider: FakeOrganizationProvider;
  let invitationProvider: FakeOrganizationInvitationProvider;
  let directory: FakeAuthUserDirectory;
  let chat: FakeInvitationDelivery;
  let service: OrganizationsService;

  beforeEach(() => {
    provider = new FakeOrganizationProvider();
    invitationProvider = new FakeOrganizationInvitationProvider();
    directory = new FakeAuthUserDirectory();
    chat = new FakeInvitationDelivery();
    service = new OrganizationsService(
      provider,
      invitationProvider,
      directory,
      chat,
    );
  });

  it.each([
    ['소유자', OrganizationRoleSchema.enum.owner],
    ['관리자', OrganizationRoleSchema.enum.admin],
  ])(
    '%s 권한은 exact username으로 Better Auth 초대를 만들고 Chat으로 전달한다',
    async (_label, role) => {
      provider.getAccess.mockResolvedValue(access(role));
      directory.resolveExactUsername.mockResolvedValue(recipient());
      invitationProvider.create.mockResolvedValue(invitation());

      await expect(
        service.createInvitation(context, 'organization-a', {
          recipientUsername: ' Recipient ',
          role: OrganizationRoleSchema.enum.member,
        }),
      ).resolves.toEqual({
        id: 'invitation-a',
        role: OrganizationRoleSchema.enum.member,
        status: 'pending',
        expiresAt: '2026-10-06T00:00:00.000Z',
        createdAt: '2026-10-05T00:00:00.000Z',
      });

      expect(invitationProvider.create).toHaveBeenCalledWith(context, {
        organizationId: 'organization-a',
        email: 'recipient@example.com',
        role: OrganizationRoleSchema.enum.member,
      });
      expect(chat.deliverOrganizationInvitation).toHaveBeenCalledWith({
        recipientUserId: 'recipient-user',
        invitationId: 'invitation-a',
        organizationId: 'organization-a',
        inviterUserId: context.userId,
        organizationNameAtSend: '조직 A',
      });
    },
  );

  it('일반 member는 사용자 resolve 전에 조직 초대를 차단한다', async () => {
    provider.getAccess.mockResolvedValue(
      access(OrganizationRoleSchema.enum.member),
    );

    await expect(
      service.createInvitation(context, 'organization-a', {
        recipientUsername: 'recipient',
        role: OrganizationRoleSchema.enum.member,
      }),
    ).rejects.toMatchObject({ code: 'ORGANIZATION_ACCESS_DENIED' });
    expect(directory.resolveExactUsername).not.toHaveBeenCalled();
    expect(invitationProvider.create).not.toHaveBeenCalled();
  });

  it('exact username을 찾지 못하면 Better Auth invitation을 만들지 않는다', async () => {
    provider.getAccess.mockResolvedValue(
      access(OrganizationRoleSchema.enum.owner),
    );
    directory.resolveExactUsername.mockResolvedValue(null);

    await expect(
      service.createInvitation(context, 'organization-a', {
        recipientUsername: 'missing-user',
        role: OrganizationRoleSchema.enum.member,
      }),
    ).rejects.toBeInstanceOf(OrganizationInvitationUnavailableError);
    expect(invitationProvider.create).not.toHaveBeenCalled();
  });

  it('Chat durable delivery가 실패하면 생성한 Better Auth invitation을 취소한다', async () => {
    provider.getAccess.mockResolvedValue(
      access(OrganizationRoleSchema.enum.owner),
    );
    directory.resolveExactUsername.mockResolvedValue(recipient());
    invitationProvider.create.mockResolvedValue(invitation());
    chat.deliverOrganizationInvitation.mockRejectedValue(
      new Error('chat persistence failed'),
    );

    await expect(
      service.createInvitation(context, 'organization-a', {
        recipientUsername: 'recipient',
        role: OrganizationRoleSchema.enum.member,
      }),
    ).rejects.toBeInstanceOf(OrganizationInvitationDeliveryFailureError);
    expect(invitationProvider.cancel).toHaveBeenCalledWith(
      context,
      'invitation-a',
    );
  });

  it('Chat delivery 보상 취소까지 실패하면 invitationId를 가진 reconciliation 오류를 유지한다', async () => {
    provider.getAccess.mockResolvedValue(
      access(OrganizationRoleSchema.enum.owner),
    );
    directory.resolveExactUsername.mockResolvedValue(recipient());
    invitationProvider.create.mockResolvedValue(invitation());
    chat.deliverOrganizationInvitation.mockRejectedValue(
      new Error('chat persistence failed'),
    );
    invitationProvider.cancel.mockRejectedValue(new Error('cancel failed'));

    await expect(
      service.createInvitation(context, 'organization-a', {
        recipientUsername: 'recipient',
        role: OrganizationRoleSchema.enum.member,
      }),
    ).rejects.toMatchObject({
      constructor: OrganizationInvitationCompensationFailureError,
      invitationId: 'invitation-a',
    });
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
    provider.getAccess.mockResolvedValue({
      organization: {
        id: 'organization-a',
        name: '조직 A',
        slug: 'organization-a',
        logo: null,
        createdAt: new Date(0).toISOString(),
      },
      role: OrganizationRoleSchema.enum.owner,
    });
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
  });

  it('자기 자신의 role 변경은 provider mutation 전에 차단한다', async () => {
    const target = member({ userId: context.userId });
    provider.getAccess.mockResolvedValue({
      organization: {
        id: 'organization-a',
        name: '조직 A',
        slug: 'organization-a',
        logo: null,
        createdAt: new Date(0).toISOString(),
      },
      role: OrganizationRoleSchema.enum.admin,
    });
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
    provider.getAccess.mockResolvedValue({
      organization: {
        id: 'organization-a',
        name: '조직 A',
        slug: 'organization-a',
        logo: null,
        createdAt: new Date(0).toISOString(),
      },
      role: OrganizationRoleSchema.enum.owner,
    });
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
    provider.getAccess.mockResolvedValue({
      organization: {
        id: 'organization-a',
        name: '조직 A',
        slug: 'organization-a',
        logo: null,
        createdAt: new Date(0).toISOString(),
      },
      role: OrganizationRoleSchema.enum.member,
    });
    provider.getMember.mockResolvedValue(target);

    await expect(
      service.removeMember(context, 'organization-a', target.id),
    ).rejects.toBeInstanceOf(SelfMemberRemovalNotSupportedError);

    expect(provider.removeMember).not.toHaveBeenCalled();
  });

  it('target organization 범위에 member가 없으면 mutation 없이 not found를 반환한다', async () => {
    provider.getAccess.mockResolvedValue({
      organization: {
        id: 'organization-a',
        name: '조직 A',
        slug: 'organization-a',
        logo: null,
        createdAt: new Date(0).toISOString(),
      },
      role: OrganizationRoleSchema.enum.owner,
    });
    provider.getMember.mockResolvedValue(null);

    await expect(
      service.changeMemberRole(context, 'organization-a', 'foreign-member', {
        role: OrganizationRoleSchema.enum.admin,
      }),
    ).rejects.toBeInstanceOf(OrganizationMemberNotFoundError);
    expect(provider.changeMemberRole).not.toHaveBeenCalled();
  });
});
