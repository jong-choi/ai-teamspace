import { z } from 'zod';

export const OrganizationRoleSchema = z.enum(['owner', 'admin', 'member']);

export type OrganizationRole = z.infer<typeof OrganizationRoleSchema>;
