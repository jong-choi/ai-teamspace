import { Injectable } from '@nestjs/common';

import { ApplicationError } from '@/application.error';
import type { Auth } from '@/auth/auth';
import type { Organization } from '@/organizations/domain/organization';
import { OrganizationSchema } from '@/organizations/domain/organization';
import {
  InvalidOrganizationRoleError,
  OrganizationAccessDeniedError,
  OrganizationCreationDeniedError,
  OrganizationMemberNotFoundError,
  OrganizationNotFoundError,
  OrganizationProviderFailureError,
  OrganizationSlugConflictError,
  OwnerTransferRequiredError,
} from '@/organizations/domain/organization.error';
import { OrganizationAccessSchema } from '@/organizations/domain/organization-access';
import type { OrganizationMember } from '@/organizations/domain/organization-member';
import { OrganizationMemberSchema } from '@/organizations/domain/organization-member';
import type { OrganizationMembershipProjection } from '@/organizations/domain/organization-membership-projection';
import {
  type OrganizationRole,
  OrganizationRoleSchema,
} from '@/organizations/domain/organization-role';
import type { CreateOrganizationInput } from '@/organizations/dto/create-organization.dto';
import type { OrganizationMemberList } from '@/organizations/dto/organization-member-list.dto';
import type { QueryOrganizationMembersInput } from '@/organizations/dto/query-organization-members.dto';
import {
  getWorkOsOrganizationAdapter,
  type WorkOsOrganizationAuth,
} from '@/organizations/infrastructure/better-auth/work-os-organization.adapter';
import {
  type OrganizationActorContext,
  OrganizationProvider,
} from '@/organizations/infrastructure/organization/organization.provider';

import { AuthService } from '@thallesp/nestjs-better-auth';
import { APIError } from 'better-auth';

type AuthApi = Auth['api'];
type AuthContext = Awaited<WorkOsOrganizationAuth['$context']>;
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
const memberSearchUserFields = [
  'name',
  'email',
  'username',
  'displayUsername',
] as const;
const memberLookupBatchSize = 100;

function escapeLikeSearchValue(value: string): string {
  return value
    .replaceAll('\\', '\\\\')
    .replaceAll('%', '\\%')
    .replaceAll('_', '\\_');
}

@Injectable()
export class BetterAuthOrganizationAdapter extends OrganizationProvider {
  constructor(
    private readonly authService: AuthService<WorkOsOrganizationAuth>,
  ) {
    super();
  }

  async listForActor(
    context: OrganizationActorContext,
  ): Promise<Organization[]> {
    const adapter = await this.organizationAdapter();
    const organizations = await this.call(() =>
      adapter.listOrganizations(context.userId),
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
        body: {
          ...input,
          userId: context.userId,
        },
      }),
    );

    if (!organization) {
      throw new OrganizationProviderFailureError();
    }

    return this.getAccess(context, organization.id);
  }

  async getAccess(context: OrganizationActorContext, organizationId: string) {
    const adapter = await this.organizationAdapter();
    const [organization, member] = await Promise.all([
      this.call(() => adapter.findOrganizationById(organizationId)),
      this.call(() =>
        adapter.checkMembership({
          userId: context.userId,
          organizationId,
        }),
      ),
    ]);

    if (!organization || !member) {
      throw new OrganizationNotFoundError();
    }

    return OrganizationAccessSchema.parse({
      organization: this.mapOrganization(organization),
      role: member.role,
    });
  }

  async listMembers(
    context: OrganizationActorContext,
    organizationId: string,
    query: QueryOrganizationMembersInput,
  ): Promise<OrganizationMemberList> {
    const search = query.search?.trim();
    if (!search) {
      return this.listMemberPage(organizationId, query);
    }

    const authContext = await this.call(
      () => this.authService.instance.$context,
    );
    return this.searchMemberPage(authContext, organizationId, query, search);
  }

  async getMember(
    _context: OrganizationActorContext,
    organizationId: string,
    memberId: string,
  ): Promise<OrganizationMember | null> {
    const adapter = await this.organizationAdapter();
    const member = await this.call(() => adapter.findMemberById(memberId));

    return member?.organizationId === organizationId
      ? this.mapMember(member)
      : null;
  }

  async hasMemberUser(
    organizationId: string,
    userId: string,
  ): Promise<boolean> {
    const adapter = await this.organizationAdapter();
    const member = await this.call(() =>
      adapter.checkMembership({ userId, organizationId }),
    );

    return member !== null;
  }

  async getMembershipProjection(
    organizationId: string,
    userId: string,
  ): Promise<OrganizationMembershipProjection | null> {
    const adapter = await this.organizationAdapter();
    const membership = await this.call(() =>
      adapter.checkMembership({ userId, organizationId }),
    );
    if (!membership) return null;
    return {
      id: membership.id,
      organizationId: membership.organizationId,
      userId: membership.userId,
      role: OrganizationRoleSchema.parse(membership.role),
      createdAt: membership.createdAt.toISOString(),
    };
  }

  async listMembershipProjectionUserIds(
    organizationId: string,
    afterUserId: string | null,
    limit: number,
  ): Promise<string[]> {
    const authContext = await this.call(
      () => this.authService.instance.$context,
    );
    const afterFilter: AuthWhere[] = afterUserId
      ? [{ field: 'userId', operator: 'gt', value: afterUserId }]
      : [];
    const rows = await this.call(() =>
      authContext.adapter.findMany<AuthMemberIdentity>({
        model: 'member',
        where: [
          { field: 'organizationId', value: organizationId },
          ...afterFilter,
        ],
        select: ['id', 'userId'],
        sortBy: { field: 'userId', direction: 'asc' },
        limit,
      }),
    );
    return rows.map(({ userId: id }) => id);
  }

  async listMembersByUserIds(
    _context: OrganizationActorContext,
    organizationId: string,
    userIds: readonly string[],
  ): Promise<OrganizationMember[]> {
    const uniqueUserIds = [...new Set(userIds)];
    if (uniqueUserIds.length === 0) return [];

    const adapter = await this.organizationAdapter();
    const membersByUserId = new Map<string, AuthListedMember>();
    for (
      let offset = 0;
      offset < uniqueUserIds.length;
      offset += memberLookupBatchSize
    ) {
      const batch = uniqueUserIds.slice(offset, offset + memberLookupBatchSize);
      const result = await this.call(() =>
        adapter.listMembers({
          organizationId,
          limit: batch.length,
          filter: {
            field: 'userId',
            operator: 'in',
            value: batch,
          },
        }),
      );
      for (const member of result.members) {
        membersByUserId.set(member.userId, member);
      }
    }

    return uniqueUserIds.flatMap((userId) => {
      const member = membersByUserId.get(userId);
      return member ? [this.mapMember(member)] : [];
    });
  }

  async changeMemberRole(
    context: OrganizationActorContext,
    organizationId: string,
    member: OrganizationMember,
    role: OrganizationRole,
  ): Promise<OrganizationMember> {
    const adapter = await this.organizationAdapter();
    const actorMember = await this.call(() =>
      adapter.findMemberByOrgId({
        userId: context.userId,
        organizationId,
      }),
    );

    if (!actorMember || actorMember.role === 'member') {
      throw new OrganizationAccessDeniedError();
    }
    if (
      actorMember.role !== 'owner' &&
      (member.role === 'owner' || role === 'owner')
    ) {
      throw new OrganizationAccessDeniedError();
    }

    const updatedMember = await this.call(() =>
      adapter.updateMember(member.id, role),
    );
    if (!updatedMember || updatedMember.organizationId !== organizationId) {
      throw new OrganizationMemberNotFoundError();
    }

    return this.mapUpdatedMember(updatedMember, member);
  }

  async removeMember(
    context: OrganizationActorContext,
    organizationId: string,
    memberId: string,
  ): Promise<void> {
    const adapter = await this.organizationAdapter();
    const [actorMember, targetMember] = await Promise.all([
      this.call(() =>
        adapter.findMemberByOrgId({
          userId: context.userId,
          organizationId,
        }),
      ),
      this.call(() => adapter.findMemberById(memberId)),
    ]);

    if (!actorMember || actorMember.role === 'member') {
      throw new OrganizationAccessDeniedError();
    }
    if (!targetMember || targetMember.organizationId !== organizationId) {
      throw new OrganizationMemberNotFoundError();
    }
    if (targetMember.role === 'owner') {
      throw new OwnerTransferRequiredError();
    }

    await this.call(() =>
      adapter.deleteMember({
        memberId,
        organizationId,
        userId: targetMember.userId,
      }),
    );
  }

  private async listMemberPage(
    organizationId: string,
    query: QueryOrganizationMembersInput,
  ): Promise<OrganizationMemberList> {
    const adapter = await this.organizationAdapter();
    const result = await this.call(() =>
      adapter.listMembers({
        organizationId,
        limit: query.limit,
        offset: query.offset,
        sortBy: 'id',
        sortOrder: 'asc',
        ...(query.role
          ? {
              filter: {
                field: 'role',
                operator: 'eq' as const,
                value: query.role,
              },
            }
          : {}),
      }),
    );

    return this.toMemberList(result.members, result.total, query);
  }

  private async searchMemberPage(
    authContext: AuthContext,
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

    return this.hydrateMemberPage(organizationId, pageMemberIds, total, query);
  }

  private async hydrateMemberPage(
    organizationId: string,
    memberIds: string[],
    total: number,
    query: QueryOrganizationMembersInput,
  ): Promise<OrganizationMemberList> {
    if (memberIds.length === 0) {
      return this.toMemberList([], total, query);
    }

    const adapter = await this.organizationAdapter();
    const result = await this.call(() =>
      adapter.listMembers({
        organizationId,
        limit: memberIds.length,
        filter: {
          field: 'id',
          operator: 'in',
          value: memberIds,
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

  private async organizationAdapter() {
    const authContext = await this.call(
      () => this.authService.instance.$context,
    );
    return getWorkOsOrganizationAdapter(authContext);
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
    const errors = this.authService.instance.$ERROR_CODES;

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
