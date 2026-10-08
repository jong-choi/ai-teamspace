import { Injectable } from '@nestjs/common';

import {
  OrganizationMemberNotFoundError,
  OrganizationNotFoundError,
} from '@/organizations/domain/organization.error';
import type { OrganizationAccess } from '@/organizations/domain/organization-access';
import type { OrganizationMember } from '@/organizations/domain/organization-member';
import {
  assertMemberRemovalAllowed,
  assertMemberRoleChangeAllowed,
  assertOrganizationAdministrationAllowed,
} from '@/organizations/domain/organization-policy';
import type { ActiveOrganization } from '@/organizations/dto/active-organization.dto';
import type { CreateOrganizationInput } from '@/organizations/dto/create-organization.dto';
import type { OrganizationList } from '@/organizations/dto/organization-list.dto';
import type { OrganizationMemberList } from '@/organizations/dto/organization-member-list.dto';
import type { QueryOrganizationMembersInput } from '@/organizations/dto/query-organization-members.dto';
import type { SetActiveOrganizationInput } from '@/organizations/dto/set-active-organization.dto';
import type { UpdateOrganizationMemberRoleInput } from '@/organizations/dto/update-organization-member-role.dto';
import {
  type OrganizationActorContext,
  OrganizationProvider,
} from '@/organizations/infrastructure/organization/organization.provider';
import { OrganizationPublicEventsService } from '@/organizations/organization-public-events.service';

const memberSearchPageSize = 100;

@Injectable()
export class OrganizationsService {
  constructor(
    private readonly organizationProvider: OrganizationProvider,
    private readonly publicEvents: OrganizationPublicEventsService,
  ) {}

  async list(context: OrganizationActorContext): Promise<OrganizationList> {
    return {
      items: await this.organizationProvider.listForActor(context),
    };
  }

  async create(
    context: OrganizationActorContext,
    input: CreateOrganizationInput,
  ): Promise<OrganizationAccess> {
    const created = await this.organizationProvider.createForActor(
      context,
      input,
    );
    await this.publicEvents.publishAuthorizationChanged({
      organizationId: created.organization.id,
      userId: context.userId,
      reason: 'member-added',
    });
    return created;
  }

  async getActive(
    context: OrganizationActorContext,
  ): Promise<ActiveOrganization> {
    const organizationId = context.activeOrganizationIdCandidate;
    if (!organizationId) {
      return { activeOrganization: null };
    }

    try {
      return {
        activeOrganization: await this.organizationProvider.getAccess(
          context,
          organizationId,
        ),
      };
    } catch (error) {
      if (error instanceof OrganizationNotFoundError) {
        return { activeOrganization: null };
      }
      throw error;
    }
  }

  async setActive(
    context: OrganizationActorContext,
    input: SetActiveOrganizationInput,
  ): Promise<ActiveOrganization> {
    if (input.organizationId === null) {
      return { activeOrganization: null };
    }

    return {
      activeOrganization: await this.organizationProvider.getAccess(
        context,
        input.organizationId,
      ),
    };
  }

  getDetail(
    context: OrganizationActorContext,
    organizationId: string,
  ): Promise<OrganizationAccess> {
    return this.organizationProvider.getAccess(context, organizationId);
  }

  async listMembers(
    context: OrganizationActorContext,
    organizationId: string,
    query: QueryOrganizationMembersInput,
  ): Promise<OrganizationMemberList> {
    await this.organizationProvider.getAccess(context, organizationId);
    return this.organizationProvider.listMembers(
      context,
      organizationId,
      query,
    );
  }

  async listMembersByUserIds(
    context: OrganizationActorContext,
    organizationId: string,
    userIds: readonly string[],
  ): Promise<OrganizationMember[]> {
    await this.organizationProvider.getAccess(context, organizationId);
    return this.organizationProvider.listMembersByUserIds(
      context,
      organizationId,
      userIds,
    );
  }

  async searchMemberUserIds(
    context: OrganizationActorContext,
    organizationId: string,
    search: string,
  ): Promise<string[]> {
    await this.organizationProvider.getAccess(context, organizationId);

    const userIds: string[] = [];
    let offset = 0;

    while (true) {
      const page = await this.organizationProvider.listMembers(
        context,
        organizationId,
        { limit: memberSearchPageSize, offset, search },
      );
      userIds.push(...page.items.map((member) => member.userId));

      if (page.items.length === 0 || offset + page.items.length >= page.total) {
        break;
      }
      offset += page.items.length;
    }

    return userIds;
  }

  async assertAdministrativeAccess(
    context: OrganizationActorContext,
    organizationId: string,
  ): Promise<void> {
    const access = await this.organizationProvider.getAccess(
      context,
      organizationId,
    );
    assertOrganizationAdministrationAllowed(access.role);
  }

  async changeMemberRole(
    context: OrganizationActorContext,
    organizationId: string,
    memberId: string,
    input: UpdateOrganizationMemberRoleInput,
  ): Promise<OrganizationMember> {
    await this.organizationProvider.getAccess(context, organizationId);
    const target = await this.organizationProvider.getMember(
      context,
      organizationId,
      memberId,
    );

    if (!target) {
      throw new OrganizationMemberNotFoundError();
    }

    assertMemberRoleChangeAllowed({
      actorUserId: context.userId,
      target,
      nextRole: input.role,
    });

    const updated = await this.organizationProvider.changeMemberRole(
      context,
      organizationId,
      target,
      input.role,
    );
    await this.publicEvents.publishAuthorizationChanged({
      organizationId,
      userId: target.userId,
      reason: 'member-role-changed',
    });
    return updated;
  }

  async removeMember(
    context: OrganizationActorContext,
    organizationId: string,
    memberId: string,
  ): Promise<void> {
    await this.organizationProvider.getAccess(context, organizationId);
    const target = await this.organizationProvider.getMember(
      context,
      organizationId,
      memberId,
    );

    if (!target) {
      throw new OrganizationMemberNotFoundError();
    }

    assertMemberRemovalAllowed({
      actorUserId: context.userId,
      target,
    });

    await this.organizationProvider.removeMember(
      context,
      organizationId,
      memberId,
    );
    await this.publicEvents.publishAuthorizationChanged({
      organizationId,
      userId: target.userId,
      reason: 'member-removed',
    });
  }
}
