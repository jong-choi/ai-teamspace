import type { OrganizationMember } from '@/organizations/domain/organization-member';

export type OrganizationMembershipProjection = Pick<
  OrganizationMember,
  'id' | 'organizationId' | 'userId' | 'role' | 'createdAt'
>;
