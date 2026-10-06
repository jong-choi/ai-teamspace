import { createZodDto } from '@/common/dto/create-zod-dto';
import { OrganizationRoleSchema } from '@/organizations/domain/organization-role';

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
