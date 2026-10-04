import { OrganizationSchema } from '#server/organizations/domain/organization.js';
import { OrganizationRoleSchema } from '#server/organizations/domain/organization-role.js';

import { z } from 'zod';

export const OrganizationAccessSchema = z
  .object({
    organization: OrganizationSchema,
    role: OrganizationRoleSchema,
  })
  .meta({ id: 'OrganizationAccess' });

export type OrganizationAccess = z.infer<typeof OrganizationAccessSchema>;
