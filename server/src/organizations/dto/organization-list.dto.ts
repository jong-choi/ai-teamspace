import { createZodDto } from '@/common/dto/create-zod-dto';
import { OrganizationSchema } from '@/organizations/domain/organization';

import { z } from 'zod';

export const OrganizationListSchema = z
  .object({
    items: z.array(OrganizationSchema),
  })
  .meta({ id: 'OrganizationList' });

export type OrganizationList = z.infer<typeof OrganizationListSchema>;

export class OrganizationListDto extends createZodDto(OrganizationListSchema) {}
