import { createZodDto } from '#server/common/dto/create-zod-dto.js';
import { OrganizationRoleSchema } from '#server/organizations/domain/organization-role.js';

import { z } from 'zod';

export const CreateOrganizationInvitationSchema = z.object({
  recipientUsername: z.string().trim().min(1).max(255),
  role: OrganizationRoleSchema.exclude(['owner']),
});

export type CreateOrganizationInvitationInput = z.infer<
  typeof CreateOrganizationInvitationSchema
>;

export class CreateOrganizationInvitationDto extends createZodDto(
  CreateOrganizationInvitationSchema,
) {}
