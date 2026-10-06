import type { AuthUserIdentity } from '@/auth/auth-user-directory.service';
import { createZodDto } from '@/common/dto/create-zod-dto';
import type { OrganizationInvitationDetail } from '@/organizations/domain/organization-invitation';
import { OrganizationInvitationStatusSchema } from '@/organizations/domain/organization-invitation';
import { OrganizationRoleSchema } from '@/organizations/domain/organization-role';

import { z } from 'zod';

export const OrganizationInvitationDetailResponseSchema = z
  .object({
    id: z.string(),
    organization: z.object({
      id: z.string(),
      name: z.string(),
      slug: z.string(),
    }),
    inviter: z.object({
      id: z.string(),
      email: z.string().email(),
      name: z.string().nullable(),
      username: z.string().nullable(),
      image: z.string().nullable(),
    }),
    role: OrganizationRoleSchema,
    status: OrganizationInvitationStatusSchema,
    expiresAt: z.string().datetime(),
    createdAt: z.string().datetime(),
  })
  .meta({ id: 'OrganizationInvitationDetail' });

export type OrganizationInvitationDetailResponse = z.infer<
  typeof OrganizationInvitationDetailResponseSchema
>;

export function toOrganizationInvitationDetailResponse(
  invitation: OrganizationInvitationDetail,
  inviter: AuthUserIdentity | undefined,
): OrganizationInvitationDetailResponse {
  return OrganizationInvitationDetailResponseSchema.parse({
    id: invitation.id,
    organization: {
      id: invitation.organizationId,
      name: invitation.organizationName,
      slug: invitation.organizationSlug,
    },
    inviter: {
      id: invitation.inviterId,
      email: invitation.inviterEmail,
      name: inviter?.name ?? null,
      username: inviter?.username ?? null,
      image: inviter?.image ?? null,
    },
    role: invitation.role,
    status: invitation.status,
    expiresAt: invitation.expiresAt.toISOString(),
    createdAt: invitation.createdAt.toISOString(),
  });
}

export class OrganizationInvitationDetailDto extends createZodDto(
  OrganizationInvitationDetailResponseSchema,
) {}
