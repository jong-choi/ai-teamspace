import type { OrganizationInvitation } from '#server/organizations/domain/organization-invitation.js';
import type { OrganizationRole } from '#server/organizations/domain/organization-role.js';
import type { OrganizationActorContext } from '#server/organizations/infrastructure/organization/organization.provider.js';

export type CreateOrganizationInvitationProviderInput = {
  organizationId: string;
  email: string;
  role: Exclude<OrganizationRole, 'owner'>;
};

export abstract class OrganizationInvitationProvider {
  abstract create(
    context: OrganizationActorContext,
    input: CreateOrganizationInvitationProviderInput,
  ): Promise<OrganizationInvitation>;

  abstract cancel(
    context: OrganizationActorContext,
    invitationId: string,
  ): Promise<void>;
}
