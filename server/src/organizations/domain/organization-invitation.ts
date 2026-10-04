import { OrganizationRoleSchema } from '#server/organizations/domain/organization-role.js';

import { z } from 'zod';

export const OrganizationInvitationStatusSchema = z.enum([
  'pending',
  'accepted',
  'rejected',
  'canceled',
]);

export const OrganizationInvitationSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  email: z.string().email(),
  role: OrganizationRoleSchema,
  status: OrganizationInvitationStatusSchema,
  inviterId: z.string(),
  expiresAt: z.date(),
  createdAt: z.date(),
});

export type OrganizationInvitation = z.infer<
  typeof OrganizationInvitationSchema
>;
