import type {
  OrganizationInvitationList,
  OrganizationInvitationsControllerCreateBody,
} from '@repo/client/api-client/schemas';
import { OrganizationInvitationsControllerCreateBody as OrganizationInvitationsControllerCreateBodySchema } from '@repo/client/api-client/schemas';

export type PendingOrganizationInvitation =
  OrganizationInvitationList['items'][number];
export type OrganizationInvitationRole =
  OrganizationInvitationsControllerCreateBody['role'];

export const ORGANIZATION_INVITATION_ROLES =
  OrganizationInvitationsControllerCreateBodySchema.shape.role.options;

export function parseOrganizationInvitationRole(
  value: string | undefined,
): OrganizationInvitationRole | undefined {
  if (!value) return undefined;

  const result =
    OrganizationInvitationsControllerCreateBodySchema.shape.role.safeParse(
      value,
    );
  return result.success ? result.data : undefined;
}

export function normalizeOrganizationInvitationUsername(value: string): string {
  return value.trim().replace(/^@/, '');
}

export function getOrganizationInvitationRecipientLabel(
  invitation: PendingOrganizationInvitation,
): string {
  const name = invitation.recipient.name?.trim();
  if (name) return name;

  const username = invitation.recipient.username?.trim();
  if (username) return `@${username}`;

  return invitation.recipient.email;
}
