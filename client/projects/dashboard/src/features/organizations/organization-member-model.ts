import type { OrganizationMember } from '@repo/client/api-client/schemas';
import { OrganizationMember as OrganizationMemberSchema } from '@repo/client/api-client/schemas';

export type OrganizationMemberRole = OrganizationMember['role'];

export const ORGANIZATION_MEMBER_ROLES =
  OrganizationMemberSchema.shape.role.options;

export function parseOrganizationMemberRole(
  value: string | undefined,
): OrganizationMemberRole | undefined {
  if (!value) return undefined;

  const result = OrganizationMemberSchema.shape.role.safeParse(value);
  return result.success ? result.data : undefined;
}

export function getOrganizationMemberRoleLabel(
  role: OrganizationMemberRole,
): string {
  switch (role) {
    case 'owner':
      return '소유자';
    case 'admin':
      return '관리자';
    case 'member':
      return '멤버';
  }
}
