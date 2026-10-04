import type {
  OrganizationInvitationList,
  OrganizationMember,
} from '@repo/client/api-client/schemas';
import { createOrganizationManagementRows } from '@core/features/organizations/organization-management-row';

import { describe, expect, it } from '@jest/globals';

const member: OrganizationMember = {
  id: 'member-a',
  organizationId: 'organization-a',
  userId: 'user-a',
  role: 'member',
  createdAt: '2026-10-05T00:00:00.000Z',
  user: {
    id: 'user-a',
    name: '멤버',
    email: 'member@example.com',
    image: null,
  },
};

const invitation: OrganizationInvitationList['items'][number] = {
  id: 'invitation-a',
  role: 'admin',
  status: 'pending',
  createdAt: '2026-10-05T00:00:00.000Z',
  expiresAt: '2026-10-07T00:00:00.000Z',
  recipient: {
    email: 'invitee@example.com',
    name: '초대 사용자',
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

describe('조직 관리 table row', () => {
  it('Invitation과 Member를 domain 그대로 유지한 presentation union으로 합친다', () => {
    expect(createOrganizationManagementRows([member], [invitation])).toEqual([
      { kind: 'invitation', invitation },
      { kind: 'member', member },
    ]);
  });
});
