import { OrganizationSchema } from '@/organizations/domain/organization';
import { OrganizationRoleSchema } from '@/organizations/domain/organization-role';

import { z } from 'zod';

export const OrganizationAccessSchema = z
  .object({
    organization: OrganizationSchema,
    role: OrganizationRoleSchema,
  })
  .meta({ id: 'OrganizationAccess' });

export type OrganizationAccess = z.infer<typeof OrganizationAccessSchema>;
