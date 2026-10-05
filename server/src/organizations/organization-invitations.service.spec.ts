import type { AuthUserDirectoryService } from '#server/auth/auth-user-directory.service.js';
import type { ChatService } from '#server/chat/chat.service.js';
import {
  OrganizationInvitationCompensationFailureError,
  OrganizationInvitationDeliveryFailureError,
  OrganizationInvitationInvalidStateError,
  OrganizationInvitationNotFoundError,
  OrganizationInvitationUnavailableError,
} from '#server/organizations/domain/organization.error.js';
import type { OrganizationInvitation } from '#server/organizations/domain/organization-invitation.js';
import { OrganizationRoleSchema } from '#server/organizations/domain/organization-role.js';
import { OrganizationInvitationProvider } from '#server/organizations/infrastructure/invitation/organization-invitation.provider.js';
import {
  type OrganizationActorContext,
  OrganizationProvider,
} from '#server/organizations/infrastructure/organization/organization.provider.js';
import { OrganizationInvitationsService } from '#server/organizations/organization-invitations.service.js';

import { jest } from '@jest/globals';

class FakeOrganizationProvider extends OrganizationProvider {
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
  setActive = jest.fn<OrganizationProvider['setActive']>();
}

class FakeOrganizationInvitationProvider extends OrganizationInvitationProvider {
  create = jest.fn<OrganizationInvitationProvider['create']>();
  getForRecipient =
    jest.fn<OrganizationInvitationProvider['getForRecipient']>();
  listForOrganization =
    jest.fn<OrganizationInvitationProvider['listForOrganization']>();
  accept = jest.fn<OrganizationInvitationProvider['accept']>();
  reject = jest.fn<OrganizationInvitationProvider['reject']>();
  cancel = jest.fn<OrganizationInvitationProvider['cancel']>();
  resend = jest.fn<OrganizationInvitationProvider['resend']>();
}

class FakeAuthUserDirectory {
  resolveExactUsername =
    jest.fn<AuthUserDirectoryService['resolveExactUsername']>();
  findByIds = jest.fn<AuthUserDirectoryService['findByIds']>();
  findByEmails = jest.fn<AuthUserDirectoryService['findByEmails']>();
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

function invitation(
  input: Partial<OrganizationInvitation> = {},
): OrganizationInvitation {
  return {
    id: 'invitation-a',
    organizationId: 'organization-a',
    email: 'recipient@example.com',
    role: OrganizationRoleSchema.enum.member,
    status: 'pending',
    inviterId: context.userId,
    expiresAt: new Date('2026-10-06T00:00:00.000Z'),
    createdAt: new Date('2026-10-05T00:00:00.000Z'),
    ...input,
  };
}

function access(role: OrganizationInvitation['role']) {
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

function inviter() {
  return {
    id: context.userId,
    email: 'actor@example.com',
    name: '초대한 사람',
    username: 'actor',
    image: null,
  };
}

describe('조직 초대 서비스', () => {
  let organizationProvider: FakeOrganizationProvider;
  let invitationProvider: FakeOrganizationInvitationProvider;
  let directory: FakeAuthUserDirectory;
  let chat: FakeInvitationDelivery;
  let service: OrganizationInvitationsService;

  beforeEach(() => {
    organizationProvider = new FakeOrganizationProvider();
    invitationProvider = new FakeOrganizationInvitationProvider();
    directory = new FakeAuthUserDirectory();
    chat = new FakeInvitationDelivery();
    service = new OrganizationInvitationsService(
      organizationProvider,
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
      organizationProvider.getAccess.mockResolvedValue(access(role));
      directory.resolveExactUsername.mockResolvedValue(recipient());
      invitationProvider.create.mockResolvedValue(invitation());

      await expect(
        service.create(context, 'organization-a', {
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
    organizationProvider.getAccess.mockResolvedValue(
      access(OrganizationRoleSchema.enum.member),
    );

    await expect(
      service.create(context, 'organization-a', {
        recipientUsername: 'recipient',
        role: OrganizationRoleSchema.enum.member,
      }),
    ).rejects.toMatchObject({ code: 'ORGANIZATION_ACCESS_DENIED' });
    expect(directory.resolveExactUsername).not.toHaveBeenCalled();
    expect(invitationProvider.create).not.toHaveBeenCalled();
  });

  it('exact username을 찾지 못하면 Better Auth invitation을 만들지 않는다', async () => {
    organizationProvider.getAccess.mockResolvedValue(
      access(OrganizationRoleSchema.enum.owner),
    );
    directory.resolveExactUsername.mockResolvedValue(null);

    await expect(
      service.create(context, 'organization-a', {
        recipientUsername: 'missing-user',
        role: OrganizationRoleSchema.enum.member,
      }),
    ).rejects.toBeInstanceOf(OrganizationInvitationUnavailableError);
    expect(invitationProvider.create).not.toHaveBeenCalled();
  });

  it('Chat durable delivery가 실패하면 생성한 Better Auth invitation을 취소한다', async () => {
    organizationProvider.getAccess.mockResolvedValue(
      access(OrganizationRoleSchema.enum.owner),
    );
    directory.resolveExactUsername.mockResolvedValue(recipient());
    invitationProvider.create.mockResolvedValue(invitation());
    chat.deliverOrganizationInvitation.mockRejectedValue(
      new Error('chat persistence failed'),
    );

    await expect(
      service.create(context, 'organization-a', {
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
    organizationProvider.getAccess.mockResolvedValue(
      access(OrganizationRoleSchema.enum.owner),
    );
    directory.resolveExactUsername.mockResolvedValue(recipient());
    invitationProvider.create.mockResolvedValue(invitation());
    chat.deliverOrganizationInvitation.mockRejectedValue(
      new Error('chat persistence failed'),
    );
    invitationProvider.cancel.mockRejectedValue(new Error('cancel failed'));

    await expect(
      service.create(context, 'organization-a', {
        recipientUsername: 'recipient',
        role: OrganizationRoleSchema.enum.member,
      }),
    ).rejects.toMatchObject({
      constructor: OrganizationInvitationCompensationFailureError,
      invitationId: 'invitation-a',
    });
  });

  it('관리자 invitation 목록은 status를 필터링하고 total과 표시 정보를 반환한다', async () => {
    const newerInvitation = invitation({
      id: 'invitation-b',
      createdAt: new Date('2026-10-05T01:00:00.000Z'),
    });
    organizationProvider.getAccess.mockResolvedValue(
      access(OrganizationRoleSchema.enum.admin),
    );
    invitationProvider.listForOrganization.mockResolvedValue([
      invitation(),
      invitation({ id: 'invitation-accepted', status: 'accepted' }),
      newerInvitation,
    ]);
    directory.findByEmails.mockResolvedValue([recipient()]);
    directory.findByIds.mockResolvedValue([inviter()]);

    await expect(
      service.list(context, 'organization-a', {
        status: 'pending',
        limit: 1,
        offset: 0,
      }),
    ).resolves.toMatchObject({
      total: 2,
      limit: 1,
      offset: 0,
      items: [
        {
          id: 'invitation-b',
          recipient: { username: 'recipient' },
          inviter: { username: 'actor' },
        },
      ],
    });
  });

  it('일반 member는 관리자 invitation 목록을 조회할 수 없다', async () => {
    organizationProvider.getAccess.mockResolvedValue(
      access(OrganizationRoleSchema.enum.member),
    );

    await expect(
      service.list(context, 'organization-a', {
        status: 'pending',
        limit: 50,
        offset: 0,
      }),
    ).rejects.toMatchObject({ code: 'ORGANIZATION_ACCESS_DENIED' });
    expect(invitationProvider.listForOrganization).not.toHaveBeenCalled();
  });

  it('수신자 invitation 상세는 조직과 초대한 사람 표시 정보를 반환한다', async () => {
    invitationProvider.getForRecipient.mockResolvedValue({
      ...invitation(),
      organizationName: '조직 A',
      organizationSlug: 'organization-a',
      inviterEmail: 'actor@example.com',
    });
    directory.findByIds.mockResolvedValue([inviter()]);

    await expect(service.get(context, 'invitation-a')).resolves.toMatchObject({
      id: 'invitation-a',
      organization: {
        id: 'organization-a',
        name: '조직 A',
        slug: 'organization-a',
      },
      inviter: {
        id: context.userId,
        email: 'actor@example.com',
        username: 'actor',
      },
      status: 'pending',
    });
  });

  it('수신자는 invitation을 수락하면 accepted projection을 받는다', async () => {
    invitationProvider.accept.mockResolvedValue(
      invitation({ status: 'accepted' }),
    );

    await expect(
      service.accept(context, 'invitation-a'),
    ).resolves.toMatchObject({
      id: 'invitation-a',
      status: 'accepted',
    });
    expect(invitationProvider.accept).toHaveBeenCalledWith(
      context,
      'invitation-a',
    );
  });

  it('수신자는 invitation을 거절하면 rejected projection을 받는다', async () => {
    invitationProvider.reject.mockResolvedValue(
      invitation({ status: 'rejected' }),
    );

    await expect(
      service.reject(context, 'invitation-a'),
    ).resolves.toMatchObject({
      id: 'invitation-a',
      status: 'rejected',
    });
    expect(invitationProvider.reject).toHaveBeenCalledWith(
      context,
      'invitation-a',
    );
  });

  it('관리자는 pending invitation을 취소한다', async () => {
    organizationProvider.getAccess.mockResolvedValue(
      access(OrganizationRoleSchema.enum.admin),
    );
    invitationProvider.listForOrganization.mockResolvedValue([invitation()]);

    await expect(
      service.cancel(context, 'organization-a', 'invitation-a'),
    ).resolves.toBeUndefined();
    expect(invitationProvider.cancel).toHaveBeenCalledWith(
      context,
      'invitation-a',
    );
  });

  it('관리자 route의 조직과 다른 invitation은 취소하지 않는다', async () => {
    organizationProvider.getAccess.mockResolvedValue(
      access(OrganizationRoleSchema.enum.owner),
    );
    invitationProvider.listForOrganization.mockResolvedValue([
      invitation({ organizationId: 'organization-b' }),
    ]);

    await expect(
      service.cancel(context, 'organization-a', 'invitation-a'),
    ).rejects.toBeInstanceOf(OrganizationInvitationNotFoundError);
    expect(invitationProvider.cancel).not.toHaveBeenCalled();
  });

  it('pending이 아닌 invitation은 관리자 취소를 허용하지 않는다', async () => {
    organizationProvider.getAccess.mockResolvedValue(
      access(OrganizationRoleSchema.enum.owner),
    );
    invitationProvider.listForOrganization.mockResolvedValue([
      invitation({ status: 'accepted' }),
    ]);

    await expect(
      service.cancel(context, 'organization-a', 'invitation-a'),
    ).rejects.toBeInstanceOf(OrganizationInvitationInvalidStateError);
    expect(invitationProvider.cancel).not.toHaveBeenCalled();
  });

  it('resend 대상 사용자를 더 이상 찾을 수 없으면 Better Auth를 호출하지 않는다', async () => {
    organizationProvider.getAccess.mockResolvedValue(
      access(OrganizationRoleSchema.enum.admin),
    );
    invitationProvider.listForOrganization.mockResolvedValue([invitation()]);
    directory.findByEmails.mockResolvedValue([]);

    await expect(
      service.resend(context, 'organization-a', 'invitation-a'),
    ).rejects.toBeInstanceOf(OrganizationInvitationUnavailableError);
    expect(invitationProvider.resend).not.toHaveBeenCalled();
  });

  it('관리자 resend는 같은 invitation을 갱신하고 기존 Chat message를 다시 알린다', async () => {
    const resent = invitation({
      expiresAt: new Date('2026-10-07T00:00:00.000Z'),
    });
    organizationProvider.getAccess.mockResolvedValue(
      access(OrganizationRoleSchema.enum.admin),
    );
    invitationProvider.listForOrganization.mockResolvedValue([invitation()]);
    directory.findByEmails.mockResolvedValue([recipient()]);
    invitationProvider.resend.mockResolvedValue(resent);

    await expect(
      service.resend(context, 'organization-a', 'invitation-a'),
    ).resolves.toMatchObject({
      id: 'invitation-a',
      status: 'pending',
      expiresAt: '2026-10-07T00:00:00.000Z',
    });
    expect(invitationProvider.resend).toHaveBeenCalledWith(context, {
      expectedInvitationId: 'invitation-a',
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
      republishExistingMessage: true,
    });
  });
});
