import { createZodDto } from '#server/common/dto/create-zod-dto.js';
import { OrganizationAccessSchema } from '#server/organizations/domain/organization-access.js';

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
