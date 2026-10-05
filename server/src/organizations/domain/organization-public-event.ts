import { z } from 'zod';

export const ORGANIZATION_PUBLIC_EVENT_QUEUE = 'organization-public-events';
export const ORGANIZATION_AUTHORIZATION_CHANGED_JOB =
  'organization-authorization-changed';

export const OrganizationAuthorizationChangedEventSchema = z.object({
  organizationId: z.string().min(1),
  userId: z.string().min(1),
  reason: z.enum(['member-role-changed', 'member-removed']),
});

export type OrganizationAuthorizationChangedEvent = z.infer<
  typeof OrganizationAuthorizationChangedEventSchema
>;
