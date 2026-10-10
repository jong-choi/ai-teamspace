import type { OrganizationInvitationList } from '@repo/client/api-client/schemas';
import {
  getOrganizationInvitationRecipientLabel,
  normalizeOrganizationInvitationUsername,
  ORGANIZATION_INVITATION_ROLES,
  parseOrganizationInvitationRole,
} from '@core/features/organizations/organization-invitation-model';

import { describe, expect, it } from '@jest/globals';

const invitation: OrganizationInvitationList['items'][number] = {
  id: 'invitation-a',
  role: 'member',
  status: 'pending',
  createdAt: '2026-10-05T00:00:00.000Z',
  expiresAt: '2026-10-07T00:00:00.000Z',
  recipient: {
    email: 'invitee@example.com',
    name: null,
    username: 'invitee',
    image: null,
  },
  inviter: {
    id: 'inviter-a',
    email: 'inviter@example.com',
    name: '관리자',
    username: 'admin',
    image: null,
  },
};

describe('조직 초대 UI 모델', () => {
  it('초대 가능한 역할은 generated create 계약의 member와 admin만 사용한다', () => {
    expect(ORGANIZATION_INVITATION_ROLES).toEqual(['admin', 'member']);
    expect(parseOrganizationInvitationRole('admin')).toBe('admin');
    expect(parseOrganizationInvitationRole('member')).toBe('member');
    expect(parseOrganizationInvitationRole('owner')).toBeUndefined();
  });

  it('입력한 사용자명의 공백과 표시용 @를 제거한다', () => {
    expect(normalizeOrganizationInvitationUsername('  @invitee  ')).toBe(
      'invitee',
    );
    expect(normalizeOrganizationInvitationUsername('invitee')).toBe('invitee');
  });

  it('recipient 표시는 이름, 사용자명, 이메일 순서로 안전하게 fallback한다', () => {
    expect(
      getOrganizationInvitationRecipientLabel({
        ...invitation,
        recipient: { ...invitation.recipient, name: '초대 사용자' },
      }),
    ).toBe('초대 사용자');
    expect(getOrganizationInvitationRecipientLabel(invitation)).toBe(
      '@invitee',
    );
    expect(
      getOrganizationInvitationRecipientLabel({
        ...invitation,
        recipient: { ...invitation.recipient, username: null },
      }),
    ).toBe('invitee@example.com');
  });
});
