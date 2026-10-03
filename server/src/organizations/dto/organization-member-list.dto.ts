import { createZodDto } from '#server/common/dto/create-zod-dto.js';
import { OrganizationMemberSchema } from '#server/organizations/domain/organization-member.js';

import { z } from 'zod';

export const OrganizationMemberListSchema = z.object({
  items: z.array(OrganizationMemberSchema),
  total: z.number().int().nonnegative(),
  limit: z.number().int().positive(),
  offset: z.number().int().nonnegative(),
});

export type OrganizationMemberList = z.infer<
  typeof OrganizationMemberListSchema
>;

export class OrganizationMemberListDto extends createZodDto(
  OrganizationMemberListSchema,
) {}
