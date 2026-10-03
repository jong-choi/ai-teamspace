import { createZodDto } from '#server/common/dto/create-zod-dto.js';
import { OrganizationRoleSchema } from '#server/organizations/domain/organization-role.js';

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
