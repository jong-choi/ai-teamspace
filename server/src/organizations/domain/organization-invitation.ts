import { OrganizationRoleSchema } from '@/organizations/domain/organization-role';

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

export const OrganizationInvitationDetailSchema =
  OrganizationInvitationSchema.extend({
    organizationName: z.string().min(1),
    organizationSlug: z.string().min(1),
    inviterEmail: z.string().email(),
  });

export type OrganizationInvitation = z.infer<
  typeof OrganizationInvitationSchema
>;
export type OrganizationInvitationDetail = z.infer<
  typeof OrganizationInvitationDetailSchema
>;
