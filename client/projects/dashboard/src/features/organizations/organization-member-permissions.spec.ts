import type { OrganizationMember } from '@repo/client/api-client/schemas';
import {
  getAssignableOrganizationMemberRoles,
  getOrganizationMemberManagementPermissions,
} from '@core/features/organizations/organization-member-permissions';

import { describe, expect, it } from '@jest/globals';

const targetMember: OrganizationMember = {
  id: 'member-target',
  organizationId: 'organization-a',
  userId: 'target-user',
  role: 'member',
  createdAt: '2026-10-05T00:00:00.000Z',
  user: {
    id: 'target-user',
    name: '대상 사용자',
    email: 'target@example.com',
    image: null,
  },
};

describe('조직 멤버 관리 UI 권한', () => {
  it('owner와 admin은 다른 non-owner 멤버를 관리할 수 있다', () => {
    expect(
      getOrganizationMemberManagementPermissions({
        actorRole: 'owner',
        actorUserId: 'actor-owner',
        target: targetMember,
      }),
    ).toEqual({ canChangeRole: true, canRemove: true });

    expect(
      getOrganizationMemberManagementPermissions({
        actorRole: 'admin',
        actorUserId: 'actor-admin',
        target: targetMember,
      }),
    ).toEqual({ canChangeRole: true, canRemove: true });
  });

  it('member actor에게 관리 action을 노출하지 않는다', () => {
    expect(
      getOrganizationMemberManagementPermissions({
        actorRole: 'member',
        actorUserId: 'actor-member',
        target: targetMember,
      }),
    ).toEqual({ canChangeRole: false, canRemove: false });
  });

  it('자기 자신과 owner target의 generic 관리 action을 노출하지 않는다', () => {
    expect(
      getOrganizationMemberManagementPermissions({
        actorRole: 'owner',
        actorUserId: targetMember.userId,
        target: targetMember,
      }),
    ).toEqual({ canChangeRole: false, canRemove: false });

    expect(
      getOrganizationMemberManagementPermissions({
        actorRole: 'owner',
        actorUserId: 'actor-owner',
        target: { ...targetMember, role: 'owner' },
      }),
    ).toEqual({ canChangeRole: false, canRemove: false });
  });

  it('admin에게 owner 승격 옵션을 노출하지 않는다', () => {
    expect(getAssignableOrganizationMemberRoles('owner')).toEqual([
      'owner',
      'admin',
      'member',
    ]);
    expect(getAssignableOrganizationMemberRoles('admin')).toEqual([
      'admin',
      'member',
    ]);
    expect(getAssignableOrganizationMemberRoles('member')).toEqual([]);
  });
});
