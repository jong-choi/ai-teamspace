import { createZodDto } from '@/common/dto/create-zod-dto';
import { OrganizationAccessSchema } from '@/organizations/domain/organization-access';

import { z } from 'zod';

export const ActiveOrganizationSchema = z
  .object({
    activeOrganization: OrganizationAccessSchema.nullable(),
  })
  .meta({ id: 'ActiveOrganization' });

export type ActiveOrganization = z.infer<typeof ActiveOrganizationSchema>;

export class ActiveOrganizationDto extends createZodDto(
  ActiveOrganizationSchema,
) {}
