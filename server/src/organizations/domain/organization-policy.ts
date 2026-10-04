import {
  OrganizationAccessDeniedError,
  OwnerTransferRequiredError,
  SelfMemberRemovalNotSupportedError,
  SelfRoleChangeNotSupportedError,
} from '#server/organizations/domain/organization.error.js';
import type { OrganizationMember } from '#server/organizations/domain/organization-member.js';
import type { OrganizationRole } from '#server/organizations/domain/organization-role.js';
import { OrganizationRoleSchema } from '#server/organizations/domain/organization-role.js';

export function assertInvitationAdminAllowed(role: OrganizationRole): void {
  if (role === OrganizationRoleSchema.enum.member) {
    throw new OrganizationAccessDeniedError();
  }
}

export function assertMemberRoleChangeAllowed(input: {
  actorUserId: string;
  target: OrganizationMember;
  nextRole: OrganizationRole;
}): void {
  if (input.target.userId === input.actorUserId) {
    throw new SelfRoleChangeNotSupportedError();
  }

  if (
    input.target.role === OrganizationRoleSchema.enum.owner &&
    input.nextRole !== OrganizationRoleSchema.enum.owner
  ) {
    throw new OwnerTransferRequiredError();
  }
}

export function assertMemberRemovalAllowed(input: {
  actorUserId: string;
  target: OrganizationMember;
}): void {
  if (input.target.userId === input.actorUserId) {
    throw new SelfMemberRemovalNotSupportedError();
  }

  if (input.target.role === OrganizationRoleSchema.enum.owner) {
    throw new OwnerTransferRequiredError();
  }
}
