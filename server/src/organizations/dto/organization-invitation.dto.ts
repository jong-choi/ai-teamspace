import { createZodDto } from '#server/common/dto/create-zod-dto.js';
import type { OrganizationInvitation } from '#server/organizations/domain/organization-invitation.js';
import { OrganizationInvitationSchema } from '#server/organizations/domain/organization-invitation.js';

import { z } from 'zod';

export const OrganizationInvitationResponseSchema =
  OrganizationInvitationSchema.pick({
    id: true,
    role: true,
    status: true,
  })
    .extend({
      expiresAt: z.string().datetime(),
      createdAt: z.string().datetime(),
    })
    .meta({ id: 'OrganizationInvitation' });

export type OrganizationInvitationResponse = z.infer<
  typeof OrganizationInvitationResponseSchema
>;

export function toOrganizationInvitationResponse(
  invitation: OrganizationInvitation,
): OrganizationInvitationResponse {
  return OrganizationInvitationResponseSchema.parse({
    id: invitation.id,
    role: invitation.role,
    status: invitation.status,
    expiresAt: invitation.expiresAt.toISOString(),
    createdAt: invitation.createdAt.toISOString(),
  });
}

export class OrganizationInvitationDto extends createZodDto(
  OrganizationInvitationResponseSchema,
) {}
