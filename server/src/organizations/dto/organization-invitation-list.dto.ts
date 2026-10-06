import type { AuthUserIdentity } from '@/auth/auth-user-directory.service';
import { createZodDto } from '@/common/dto/create-zod-dto';
import type { OrganizationInvitation } from '@/organizations/domain/organization-invitation';
import { OrganizationInvitationResponseSchema } from '@/organizations/dto/organization-invitation.dto';

import { z } from 'zod';

const OrganizationInvitationRecipientSchema = z.object({
  email: z.string().email(),
  name: z.string().nullable(),
  username: z.string().nullable(),
  image: z.string().nullable(),
});

const OrganizationInvitationInviterSchema = z.object({
  id: z.string(),
  email: z.string().email().nullable(),
  name: z.string().nullable(),
  username: z.string().nullable(),
  image: z.string().nullable(),
});

export const OrganizationInvitationListItemSchema =
  OrganizationInvitationResponseSchema.extend({
    recipient: OrganizationInvitationRecipientSchema,
    inviter: OrganizationInvitationInviterSchema,
  });

export const OrganizationInvitationListSchema = z
  .object({
    items: z.array(OrganizationInvitationListItemSchema),
    total: z.number().int().nonnegative(),
    limit: z.number().int().positive(),
    offset: z.number().int().nonnegative(),
  })
  .meta({ id: 'OrganizationInvitationList' });

export type OrganizationInvitationList = z.infer<
  typeof OrganizationInvitationListSchema
>;
export type OrganizationInvitationListItem = z.infer<
  typeof OrganizationInvitationListItemSchema
>;

export function toOrganizationInvitationListItem(
  invitation: OrganizationInvitation,
  recipient: AuthUserIdentity | undefined,
  inviter: AuthUserIdentity | undefined,
): OrganizationInvitationListItem {
  return OrganizationInvitationListItemSchema.parse({
    id: invitation.id,
    role: invitation.role,
    status: invitation.status,
    expiresAt: invitation.expiresAt.toISOString(),
    createdAt: invitation.createdAt.toISOString(),
    recipient: {
      email: invitation.email,
      name: recipient?.name ?? null,
      username: recipient?.username ?? null,
      image: recipient?.image ?? null,
    },
    inviter: {
      id: invitation.inviterId,
      email: inviter?.email ?? null,
      name: inviter?.name ?? null,
      username: inviter?.username ?? null,
      image: inviter?.image ?? null,
    },
  });
}

export class OrganizationInvitationListDto extends createZodDto(
  OrganizationInvitationListSchema,
) {}
