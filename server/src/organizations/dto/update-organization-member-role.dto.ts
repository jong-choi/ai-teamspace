import { createZodDto } from '@/common/dto/create-zod-dto';
import { OrganizationRoleSchema } from '@/organizations/domain/organization-role';

import { z } from 'zod';

export const UpdateOrganizationMemberRoleSchema = z.object({
  role: OrganizationRoleSchema,
});

export type UpdateOrganizationMemberRoleInput = z.infer<
  typeof UpdateOrganizationMemberRoleSchema
>;

export class UpdateOrganizationMemberRoleDto extends createZodDto(
  UpdateOrganizationMemberRoleSchema,
) {}
