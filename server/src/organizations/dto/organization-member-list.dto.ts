import { createZodDto } from '@/common/dto/create-zod-dto';
import { OrganizationMemberSchema } from '@/organizations/domain/organization-member';

import { z } from 'zod';

export const OrganizationMemberListSchema = z
  .object({
    items: z.array(OrganizationMemberSchema),
    total: z.number().int().nonnegative(),
    limit: z.number().int().positive(),
    offset: z.number().int().nonnegative(),
  })
  .meta({ id: 'OrganizationMemberList' });

export type OrganizationMemberList = z.infer<
  typeof OrganizationMemberListSchema
>;

export class OrganizationMemberListDto extends createZodDto(
  OrganizationMemberListSchema,
) {}
