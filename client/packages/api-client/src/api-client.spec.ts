import {
  getInvitationsControllerGetDetailSuspenseQueryOptions,
  getOrganizationInvitationsControllerListSuspenseQueryOptions,
  organizationsControllerCreate,
  organizationsControllerGetActive,
  organizationsControllerRemoveMember,
} from '@repo/client/api-client';
import {
  ChatMessage,
  OrganizationInvitationsControllerCreateBody,
  OrganizationInvitationsControllerListParams,
} from '@repo/client/api-client/schemas';

import { jest } from '@jest/globals';
import { ZodError } from 'zod';

afterEach(() => jest.restoreAllMocks());

describe('생성된 조직 API 계약', () => {
  it('활성 조직의 null 응답과 쿠키 전달을 보존한다', async () => {
    const fetch = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(Response.json({ activeOrganization: null }));
    const result = await organizationsControllerGetActive();
    expect(result.activeOrganization).toBeNull();
    expect(fetch).toHaveBeenCalledWith(
      '/organizations/active',
      expect.objectContaining({ credentials: 'include' }),
    );
  });

  it('RFC 9457 오류를 성공 데이터로 반환하지 않고 거절한다', async () => {
    const problem = {
      type: 'about:blank',
      title: 'Conflict',
      status: 409,
      errorCode: 'ORGANIZATION_SLUG_CONFLICT',
    };
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(Response.json(problem, { status: 409 }));
    await expect(
      organizationsControllerCreate({ name: '조직', slug: 'existing' }),
    ).rejects.toEqual(problem);
  });

  it('생성된 Zod 계약과 다른 성공 응답은 거절한다', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(Response.json({ activeOrganization: {} }));

    await expect(organizationsControllerGetActive()).rejects.toBeInstanceOf(
      ZodError,
    );
  });

  it('삭제의 204 응답은 JSON 본문 없이 처리한다', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(null, { status: 204 }));
    const result = await organizationsControllerRemoveMember(
      'organization',
      'member',
    );
    expect(result).toBeUndefined();
  });

  it('조직 초대 조회는 Suspense query options와 안정적인 query key를 생성한다', () => {
    expect(
      getOrganizationInvitationsControllerListSuspenseQueryOptions(
        'organization',
        { status: 'pending' },
      ).queryKey,
    ).toEqual([
      '/organizations/organization/invitations',
      { status: 'pending' },
    ]);
    expect(
      getInvitationsControllerGetDetailSuspenseQueryOptions('invitation')
        .queryKey,
    ).toEqual(['/invitations/invitation']);
  });

  it('조직 초대 generated Zod는 기본 query와 허용 role을 보존한다', () => {
    expect(OrganizationInvitationsControllerListParams.parse({})).toEqual({
      status: 'pending',
      limit: 50,
      offset: 0,
    });
    expect(
      OrganizationInvitationsControllerCreateBody.safeParse({
        recipientUsername: 'recipient',
        role: 'admin',
      }).success,
    ).toBe(true);
    expect(
      OrganizationInvitationsControllerCreateBody.safeParse({
        recipientUsername: 'recipient',
        role: 'owner',
      }).success,
    ).toBe(false);
  });

  it('채팅 generated Zod는 content.type을 메시지 renderer의 discriminator로 사용한다', () => {
    const message = {
      id: '22222222-2222-4222-8222-222222222222',
      conversationId: '11111111-1111-4111-8111-111111111111',
      senderKind: 'user',
      senderUserId: 'user',
      referenceKind: null,
      referenceId: null,
      content: { type: 'text', text: '안녕하세요' },
      createdAt: '2026-10-05T00:00:00.000Z',
      updatedAt: '2026-10-05T00:00:00.000Z',
      editedAt: null,
    };

    expect(ChatMessage.safeParse(message).success).toBe(true);
    expect(
      ChatMessage.safeParse({
        ...message,
        content: { text: 'discriminator 없음' },
      }).success,
    ).toBe(false);
    expect(
      ChatMessage.safeParse({
        ...message,
        senderKind: 'system',
        senderUserId: null,
        referenceKind: 'organization_invitation',
        referenceId: 'invitation',
        content: {
          type: 'organization_invitation',
          invitationId: 'invitation',
          organizationId: 'organization',
          inviterUserId: 'inviter',
        },
      }).success,
    ).toBe(true);
  });
});
