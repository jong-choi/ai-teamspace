import { Injectable } from '@nestjs/common';

import { ApplicationError } from '#server/application.error.js';
import type { Auth } from '#server/auth/auth.js';
import { organizationPlugin } from '#server/auth/auth-options.js';
import {
  InvalidOrganizationRoleError,
  OrganizationAccessDeniedError,
  OrganizationCreationDeniedError,
  OrganizationMemberNotFoundError,
  OrganizationNotFoundError,
  OrganizationProviderFailureError,
  OrganizationSlugConflictError,
  OwnerTransferRequiredError,
} from '#server/organizations/domain/organization.error.js';
import type { Organization } from '#server/organizations/domain/organization.js';
import { OrganizationSchema } from '#server/organizations/domain/organization.js';
import { OrganizationAccessSchema } from '#server/organizations/domain/organization-access.js';
import type { OrganizationMember } from '#server/organizations/domain/organization-member.js';
import { OrganizationMemberSchema } from '#server/organizations/domain/organization-member.js';
import type { OrganizationRole } from '#server/organizations/domain/organization-role.js';
import type { CreateOrganizationInput } from '#server/organizations/dto/create-organization.dto.js';
import type { OrganizationMemberList } from '#server/organizations/dto/organization-member-list.dto.js';
import type { QueryOrganizationMembersInput } from '#server/organizations/dto/query-organization-members.dto.js';
import {
  type OrganizationActorContext,
  OrganizationProvider,
} from '#server/organizations/infrastructure/organization/organization.provider.js';

import { AuthService } from '@thallesp/nestjs-better-auth';
import { APIError } from 'better-auth';
import { fromNodeHeaders } from 'better-auth/node';
import { z } from 'zod';

const credentialSchema = z.record(
  z.string(),
  z.union([z.string(), z.array(z.string()), z.undefined()]),
);

type AuthApi = Auth['api'];
type AuthContext = Awaited<Auth['$context']>;
type AuthOrganization = Awaited<
  ReturnType<AuthApi['listOrganizations']>
>[number];
type AuthMemberList = Awaited<ReturnType<AuthApi['listMembers']>>;
type AuthListedMember = AuthMemberList['members'][number];
type AuthMemberIdentity = Pick<AuthListedMember, 'id' | 'userId'>;
type AuthUserIdentity = Pick<Auth['$Infer']['Session']['user'], 'id'>;
type AuthUpdatedMember = Awaited<ReturnType<AuthApi['updateMemberRole']>>;
type AuthWhere = NonNullable<
  Parameters<AuthContext['adapter']['findMany']>[0]['where']
>[number];
type ListMembersContext = NonNullable<Parameters<AuthApi['listMembers']>[0]>;
type ListMembersQuery = NonNullable<ListMembersContext['query']>;

const memberSearchUserFields = [
  'name',
  'email',
  'username',
  'displayUsername',
] as const;

const memberIdFilter = {
  filterField: 'id',
  filterOperator: 'eq',
  limit: 1,
} as const satisfies Pick<
  ListMembersQuery,
  'filterField' | 'filterOperator' | 'limit'
>;

function escapeLikeSearchValue(value: string): string {
  return value
    .replaceAll('\\', '\\\\')
    .replaceAll('%', '\\%')
    .replaceAll('_', '\\_');
}

@Injectable()
export class BetterAuthOrganizationAdapter extends OrganizationProvider {
  constructor(private readonly authService: AuthService<Auth>) {
    super();
  }

  async listForActor(
    context: OrganizationActorContext,
  ): Promise<Organization[]> {
    const organizations = await this.call(() =>
      this.authService.api.listOrganizations({
        headers: this.headers(context),
      }),
    );

    return organizations.map((organization) =>
      this.mapOrganization(organization),
    );
  }

  async createForActor(
    context: OrganizationActorContext,
    input: CreateOrganizationInput,
  ) {
    const organization = await this.call(() =>
      this.authService.api.createOrganization({
        body: input,
        headers: this.headers(context),
      }),
    );

    if (!organization) {
      throw new OrganizationProviderFailureError();
    }

    return this.getAccess(context, organization.id);
  }

  async getAccess(context: OrganizationActorContext, organizationId: string) {
    const organizations = await this.listForActor(context);
    const organization = organizations.find(
      (candidate) => candidate.id === organizationId,
    );

    if (!organization) {
      throw new OrganizationNotFoundError();
    }

    const access = await this.call(() =>
      this.authService.api.getActiveMemberRole({
        headers: this.headers(context),
        query: { organizationId },
      }),
    );

    return OrganizationAccessSchema.parse({
      organization,
      role: access.role,
    });
  }

  async listMembers(
    context: OrganizationActorContext,
    organizationId: string,
    query: QueryOrganizationMembersInput,
  ): Promise<OrganizationMemberList> {
    const search = query.search?.trim();
    if (!search) {
      return this.listMemberPage(context, organizationId, query);
    }

    const authContext = await this.call(
      () => this.authService.instance.$context,
    );
    return this.searchMemberPage(
      authContext,
      context,
      organizationId,
      query,
      search,
    );
  }

  async getMember(
    context: OrganizationActorContext,
    organizationId: string,
    memberId: string,
  ): Promise<OrganizationMember | null> {
    const result = await this.call(() =>
      this.authService.api.listMembers({
        headers: this.headers(context),
        query: {
          ...memberIdFilter,
          filterValue: memberId,
          organizationId,
        },
      }),
    );
    const member = result.members[0];

    return member ? this.mapMember(member) : null;
  }

  async changeMemberRole(
    context: OrganizationActorContext,
    organizationId: string,
    member: OrganizationMember,
    role: OrganizationRole,
  ): Promise<OrganizationMember> {
    const updatedMember = await this.call(() =>
      this.authService.api.updateMemberRole({
        body: {
          memberId: member.id,
          organizationId,
          role,
        },
        headers: this.headers(context),
      }),
    );

    return this.mapUpdatedMember(updatedMember, member);
  }

  async removeMember(
    context: OrganizationActorContext,
    organizationId: string,
    memberId: string,
  ): Promise<void> {
    await this.call(() =>
      this.authService.api.removeMember({
        body: {
          memberIdOrEmail: memberId,
          organizationId,
        },
        headers: this.headers(context),
      }),
    );
  }

  async setActive(
    context: OrganizationActorContext,
    organizationId: string | null,
  ) {
    await this.call(() =>
      this.authService.api.setActiveOrganization({
        body: { organizationId },
        headers: this.headers(context),
      }),
    );

    return organizationId ? this.getAccess(context, organizationId) : null;
  }

  private async listMemberPage(
    context: OrganizationActorContext,
    organizationId: string,
    query: QueryOrganizationMembersInput,
  ): Promise<OrganizationMemberList> {
    const roleFilter = query.role
      ? ({
          filterField: 'role',
          filterOperator: 'eq',
          filterValue: query.role,
        } satisfies Pick<
          ListMembersQuery,
          'filterField' | 'filterOperator' | 'filterValue'
        >)
      : {};
    const result = await this.call(() =>
      this.authService.api.listMembers({
        headers: this.headers(context),
        query: {
          organizationId,
          limit: query.limit,
          offset: query.offset,
          sortBy: 'id',
          sortDirection: 'asc',
          ...roleFilter,
        },
      }),
    );

    return this.toMemberList(result.members, result.total, query);
  }

  private async searchMemberPage(
    authContext: AuthContext,
    context: OrganizationActorContext,
    organizationId: string,
    query: QueryOrganizationMembersInput,
    search: string,
  ): Promise<OrganizationMemberList> {
    const memberWhere: AuthWhere[] = [
      { field: 'organizationId', value: organizationId },
      ...(query.role ? [{ field: 'role', value: query.role }] : []),
    ];
    const candidates = await this.call(() =>
      authContext.adapter.findMany<AuthMemberIdentity>({
        model: 'member',
        where: memberWhere,
        select: ['id', 'userId'],
        sortBy: { field: 'id', direction: 'asc' },
      }),
    );

    if (candidates.length === 0) {
      return this.toMemberList([], 0, query);
    }

    const escapedSearch = escapeLikeSearchValue(search);
    const userWhere: AuthWhere[] = [
      {
        field: 'id',
        operator: 'in',
        value: candidates.map((member) => member.userId),
      },
      ...memberSearchUserFields.map((field): AuthWhere => ({
        field,
        operator: 'contains',
        connector: 'OR',
        mode: 'insensitive',
        value: escapedSearch,
      })),
    ];
    const users = await this.call(() =>
      authContext.adapter.findMany<AuthUserIdentity>({
        model: 'user',
        where: userWhere,
        select: ['id'],
      }),
    );
    const matchedUserIds = new Set(users.map((user) => user.id));
    const matchedMembers = candidates.filter((member) =>
      matchedUserIds.has(member.userId),
    );
    const total = matchedMembers.length;
    const pageMemberIds = matchedMembers
      .slice(query.offset, query.offset + query.limit)
      .map((member) => member.id);

    return this.hydrateMemberPage(
      context,
      organizationId,
      pageMemberIds,
      total,
      query,
    );
  }

  private async hydrateMemberPage(
    context: OrganizationActorContext,
    organizationId: string,
    memberIds: string[],
    total: number,
    query: QueryOrganizationMembersInput,
  ): Promise<OrganizationMemberList> {
    if (memberIds.length === 0) {
      return this.toMemberList([], total, query);
    }

    const result = await this.call(() =>
      this.authService.api.listMembers({
        headers: this.headers(context),
        query: {
          organizationId,
          limit: memberIds.length,
          filterField: 'id',
          filterOperator: 'in',
          filterValue: memberIds,
        },
      }),
    );
    const membersById = new Map(
      result.members.map((member) => [member.id, member]),
    );
    const members = memberIds.flatMap((memberId) => {
      const member = membersById.get(memberId);
      return member ? [member] : [];
    });

    return this.toMemberList(members, total, query);
  }

  private toMemberList(
    members: AuthListedMember[],
    total: number,
    query: QueryOrganizationMembersInput,
  ): OrganizationMemberList {
    return {
      items: members.map((member) => this.mapMember(member)),
      total,
      limit: query.limit,
      offset: query.offset,
    };
  }

  private headers(context: OrganizationActorContext) {
    return fromNodeHeaders(credentialSchema.parse(context.providerCredential));
  }

  private mapOrganization(organization: AuthOrganization): Organization {
    return OrganizationSchema.parse({
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      logo: organization.logo ?? null,
      createdAt: organization.createdAt.toISOString(),
    });
  }

  private mapMember(member: AuthListedMember): OrganizationMember {
    return OrganizationMemberSchema.parse({
      id: member.id,
      organizationId: member.organizationId,
      userId: member.userId,
      role: member.role,
      createdAt: member.createdAt.toISOString(),
      user: {
        id: member.user.id,
        name: member.user.name,
        email: member.user.email,
        image: member.user.image ?? null,
      },
    });
  }

  private mapUpdatedMember(
    member: AuthUpdatedMember,
    previous: OrganizationMember,
  ): OrganizationMember {
    return OrganizationMemberSchema.parse({
      id: member.id,
      organizationId: member.organizationId,
      userId: member.userId,
      role: member.role,
      createdAt: member.createdAt.toISOString(),
      user: previous.user,
    });
  }

  private async call<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof ApplicationError) throw error;
      if (error instanceof APIError) {
        throw this.mapApiError(error);
      }
      throw new OrganizationProviderFailureError({ cause: error });
    }
  }

  private mapApiError(error: APIError): Error {
    const code = error.body?.code;
    const errors = organizationPlugin.$ERROR_CODES;

    if (
      code === errors.ORGANIZATION_NOT_FOUND.code ||
      code === errors.USER_IS_NOT_A_MEMBER_OF_THE_ORGANIZATION.code ||
      code === errors.YOU_ARE_NOT_A_MEMBER_OF_THIS_ORGANIZATION.code ||
      code === errors.NO_ACTIVE_ORGANIZATION.code
    ) {
      return new OrganizationNotFoundError({ cause: error });
    }

    if (code === errors.MEMBER_NOT_FOUND.code) {
      return new OrganizationMemberNotFoundError({ cause: error });
    }

    if (
      code === errors.ORGANIZATION_ALREADY_EXISTS.code ||
      code === errors.ORGANIZATION_SLUG_ALREADY_TAKEN.code
    ) {
      return new OrganizationSlugConflictError({ cause: error });
    }

    if (
      code === errors.YOU_ARE_NOT_ALLOWED_TO_CREATE_A_NEW_ORGANIZATION.code ||
      code === errors.YOU_HAVE_REACHED_THE_MAXIMUM_NUMBER_OF_ORGANIZATIONS.code
    ) {
      return new OrganizationCreationDeniedError({ cause: error });
    }

    if (code === errors.ROLE_NOT_FOUND.code) {
      return new InvalidOrganizationRoleError({ cause: error });
    }

    if (
      code ===
        errors.YOU_CANNOT_LEAVE_THE_ORGANIZATION_AS_THE_ONLY_OWNER.code ||
      code === errors.YOU_CANNOT_LEAVE_THE_ORGANIZATION_WITHOUT_AN_OWNER.code
    ) {
      return new OwnerTransferRequiredError({ cause: error });
    }

    if (
      code === errors.YOU_ARE_NOT_ALLOWED_TO_UPDATE_THIS_MEMBER.code ||
      code === errors.YOU_ARE_NOT_ALLOWED_TO_DELETE_THIS_MEMBER.code ||
      code === errors.YOU_ARE_NOT_ALLOWED_TO_ACCESS_THIS_ORGANIZATION.code
    ) {
      return new OrganizationAccessDeniedError({ cause: error });
    }

    return new OrganizationProviderFailureError({ cause: error });
  }
}
