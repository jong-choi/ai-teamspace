import { createZodDto } from '#server/common/dto/create-zod-dto.js';
import { OrganizationRoleSchema } from '#server/organizations/domain/organization-role.js';

import { z } from 'zod';

export const QueryOrganizationMembersSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  search: z.string().min(1).max(100).regex(/\S/).optional(),
  role: OrganizationRoleSchema.optional(),
});

export type QueryOrganizationMembersInput = z.infer<
  typeof QueryOrganizationMembersSchema
>;

export class QueryOrganizationMembersDto extends createZodDto(
  QueryOrganizationMembersSchema,
) {}
