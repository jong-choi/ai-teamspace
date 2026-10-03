import { createZodDto } from '#server/common/dto/create-zod-dto.js';
import { OrganizationSchema } from '#server/organizations/domain/organization.js';

import { z } from 'zod';

export const OrganizationListSchema = z.object({
  items: z.array(OrganizationSchema),
});

export type OrganizationList = z.infer<typeof OrganizationListSchema>;

export class OrganizationListDto extends createZodDto(OrganizationListSchema) {}
