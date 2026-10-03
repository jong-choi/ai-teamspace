import type { Organization } from '#server/organizations/domain/organization.js';
import type { OrganizationAccess } from '#server/organizations/domain/organization-access.js';
import type { OrganizationMember } from '#server/organizations/domain/organization-member.js';
import type { OrganizationRole } from '#server/organizations/domain/organization-role.js';
import type { CreateOrganizationInput } from '#server/organizations/dto/create-organization.dto.js';
import type { OrganizationMemberList } from '#server/organizations/dto/organization-member-list.dto.js';
import type { QueryOrganizationMembersInput } from '#server/organizations/dto/query-organization-members.dto.js';

export interface OrganizationActorContext {
  userId: string;
  activeOrganizationIdCandidate?: string;
  providerCredential: unknown;
}

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

  abstract leave(
    context: OrganizationActorContext,
    organizationId: string,
  ): Promise<void>;

  abstract setActive(
    context: OrganizationActorContext,
    organizationId: string | null,
  ): Promise<OrganizationAccess | null>;
}
