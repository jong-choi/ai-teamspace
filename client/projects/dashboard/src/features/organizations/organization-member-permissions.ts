import type {
  OrganizationAccess,
  OrganizationMember,
} from '@repo/client/api-client/schemas';
import {
  ORGANIZATION_MEMBER_ROLES,
  type OrganizationMemberRole,
} from '@core/features/organizations/organization-member-model';

export type OrganizationMemberManagementPermissions = {
  canChangeRole: boolean;
  canRemove: boolean;
};

export function getOrganizationMemberManagementPermissions(input: {
  actorRole: OrganizationAccess['role'];
  actorUserId: string;
  target: OrganizationMember;
}): OrganizationMemberManagementPermissions {
  const actorCanManage =
    input.actorRole === 'owner' || input.actorRole === 'admin';
  const isSelf = input.target.userId === input.actorUserId;
  const targetIsOwner = input.target.role === 'owner';
  const canManageTarget = actorCanManage && !isSelf && !targetIsOwner;

  return {
    canChangeRole: canManageTarget,
    canRemove: canManageTarget,
  };
}

export function getAssignableOrganizationMemberRoles(
  actorRole: OrganizationAccess['role'],
): readonly OrganizationMemberRole[] {
  if (actorRole === 'owner') return ORGANIZATION_MEMBER_ROLES;
  if (actorRole === 'admin') {
    return ORGANIZATION_MEMBER_ROLES.filter((role) => role !== 'owner');
  }
  return [];
}
