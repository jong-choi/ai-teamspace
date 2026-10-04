import type {
  OrganizationInvitationList,
  OrganizationMember,
} from '@repo/client/api-client/schemas';

export type OrganizationManagementRow =
  | {
      kind: 'invitation';
      invitation: OrganizationInvitationList['items'][number];
    }
  | {
      kind: 'member';
      member: OrganizationMember;
    };

export function createOrganizationManagementRows(
  members: readonly OrganizationMember[],
  invitations: readonly OrganizationInvitationList['items'][number][],
): OrganizationManagementRow[] {
  return [
    ...invitations.map((invitation): OrganizationManagementRow => ({
      kind: 'invitation',
      invitation,
    })),
    ...members.map((member): OrganizationManagementRow => ({
      kind: 'member',
      member,
    })),
  ];
}
