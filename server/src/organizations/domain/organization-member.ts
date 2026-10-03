import { OrganizationRoleSchema } from '#server/organizations/domain/organization-role.js';

import { z } from 'zod';

export const OrganizationMemberSchema = z.object({
  id: z.string().min(1),
  organizationId: z.string().min(1),
  userId: z.string().min(1),
  role: OrganizationRoleSchema,
  createdAt: z.string().datetime(),
  user: z.object({
    id: z.string().min(1),
    name: z.string(),
    email: z.string().email(),
    image: z.string().nullable(),
  }),
});

export type OrganizationMember = z.infer<typeof OrganizationMemberSchema>;
