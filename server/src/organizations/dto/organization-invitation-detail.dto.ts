import type { AuthUserIdentity } from '#server/auth/auth-user-directory.service.js';
import { createZodDto } from '#server/common/dto/create-zod-dto.js';
import type { OrganizationInvitationDetail } from '#server/organizations/domain/organization-invitation.js';
import { OrganizationInvitationStatusSchema } from '#server/organizations/domain/organization-invitation.js';
import { OrganizationRoleSchema } from '#server/organizations/domain/organization-role.js';

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
