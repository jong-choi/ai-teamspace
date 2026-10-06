import {
  OrganizationAccessDeniedError,
  OwnerTransferRequiredError,
  SelfMemberRemovalNotSupportedError,
  SelfRoleChangeNotSupportedError,
} from '@/organizations/domain/organization.error';
import type { OrganizationMember } from '@/organizations/domain/organization-member';
import type { OrganizationRole } from '@/organizations/domain/organization-role';
import { OrganizationRoleSchema } from '@/organizations/domain/organization-role';

export function assertInvitationAdminAllowed(role: OrganizationRole): void {
  assertOrganizationAdministrationAllowed(role);
}

export function assertOrganizationAdministrationAllowed(
  role: OrganizationRole,
): void {
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
