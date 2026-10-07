import type { Organization } from '@/organizations/domain/organization';
import type { OrganizationAccess } from '@/organizations/domain/organization-access';
import type { OrganizationMember } from '@/organizations/domain/organization-member';
import type { OrganizationRole } from '@/organizations/domain/organization-role';
import type { CreateOrganizationInput } from '@/organizations/dto/create-organization.dto';
import type { OrganizationMemberList } from '@/organizations/dto/organization-member-list.dto';
import type { QueryOrganizationMembersInput } from '@/organizations/dto/query-organization-members.dto';
import type { OrganizationActorContext } from '@/organizations/organization-actor-context';

export type { OrganizationActorContext } from '@/organizations/organization-actor-context';

export abstract class OrganizationProvider {
  abstract listForActor(
    context: OrganizationActorContext,
  ): Promise<Organization[]>;

  abstract createForActor(
    context: OrganizationActorContext,
    input: CreateOrganizationInput,
  ): Promise<OrganizationAccess>;

  abstract getAccess(
    context: OrganizationActorContext,
    organizationId: string,
  ): Promise<OrganizationAccess>;

  abstract listMembers(
    context: OrganizationActorContext,
    organizationId: string,
    query: QueryOrganizationMembersInput,
  ): Promise<OrganizationMemberList>;

  abstract getMember(
    context: OrganizationActorContext,
    organizationId: string,
    memberId: string,
  ): Promise<OrganizationMember | null>;

  abstract hasMemberUser(
    organizationId: string,
    userId: string,
  ): Promise<boolean>;

  abstract listMembersByUserIds(
    context: OrganizationActorContext,
    organizationId: string,
    userIds: readonly string[],
  ): Promise<OrganizationMember[]>;

  abstract changeMemberRole(
    context: OrganizationActorContext,
    organizationId: string,
    member: OrganizationMember,
    role: OrganizationRole,
  ): Promise<OrganizationMember>;

  abstract removeMember(
    context: OrganizationActorContext,
    organizationId: string,
    memberId: string,
  ): Promise<void>;
}
