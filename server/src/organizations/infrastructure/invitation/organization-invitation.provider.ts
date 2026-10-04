import type {
  OrganizationInvitation,
  OrganizationInvitationDetail,
} from '#server/organizations/domain/organization-invitation.js';
import type { OrganizationRole } from '#server/organizations/domain/organization-role.js';
import type { OrganizationActorContext } from '#server/organizations/infrastructure/organization/organization.provider.js';

export type CreateOrganizationInvitationProviderInput = {
  organizationId: string;
  email: string;
  role: Exclude<OrganizationRole, 'owner'>;
};

export type ResendOrganizationInvitationProviderInput = {
  expectedInvitationId: string;
  organizationId: string;
  email: string;
  role: Exclude<OrganizationRole, 'owner'>;
};

export abstract class OrganizationInvitationProvider {
  abstract create(
    context: OrganizationActorContext,
    input: CreateOrganizationInvitationProviderInput,
  ): Promise<OrganizationInvitation>;

  abstract getForRecipient(
    context: OrganizationActorContext,
    invitationId: string,
  ): Promise<OrganizationInvitationDetail>;

  abstract listForOrganization(
    context: OrganizationActorContext,
    organizationId: string,
  ): Promise<OrganizationInvitation[]>;

  abstract accept(
    context: OrganizationActorContext,
    invitationId: string,
  ): Promise<OrganizationInvitation>;

  abstract reject(
    context: OrganizationActorContext,
    invitationId: string,
  ): Promise<OrganizationInvitation>;

  abstract cancel(
    context: OrganizationActorContext,
    invitationId: string,
  ): Promise<void>;

  abstract resend(
    context: OrganizationActorContext,
    input: ResendOrganizationInvitationProviderInput,
  ): Promise<OrganizationInvitation>;
}
