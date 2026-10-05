import { Injectable, Logger } from '@nestjs/common';

import {
  OrganizationMemberNotFoundError,
  OrganizationNotFoundError,
} from '#server/organizations/domain/organization.error.js';
import type { OrganizationAccess } from '#server/organizations/domain/organization-access.js';
import type { OrganizationMember } from '#server/organizations/domain/organization-member.js';
import {
  assertMemberRemovalAllowed,
  assertMemberRoleChangeAllowed,
  assertOrganizationAdministrationAllowed,
} from '#server/organizations/domain/organization-policy.js';
import type { ActiveOrganization } from '#server/organizations/dto/active-organization.dto.js';
import type { CreateOrganizationInput } from '#server/organizations/dto/create-organization.dto.js';
import type { OrganizationList } from '#server/organizations/dto/organization-list.dto.js';
import type { OrganizationMemberList } from '#server/organizations/dto/organization-member-list.dto.js';
import type { QueryOrganizationMembersInput } from '#server/organizations/dto/query-organization-members.dto.js';
import type { SetActiveOrganizationInput } from '#server/organizations/dto/set-active-organization.dto.js';
import type { UpdateOrganizationMemberRoleInput } from '#server/organizations/dto/update-organization-member-role.dto.js';
import { OrganizationPublicEventPublisher } from '#server/organizations/infrastructure/events/organization-public-event.provider.js';
import {
  type OrganizationActorContext,
  OrganizationProvider,
} from '#server/organizations/infrastructure/organization/organization.provider.js';

const memberSearchPageSize = 100;

@Injectable()
export class OrganizationsService {
  private readonly logger = new Logger(OrganizationsService.name);

  constructor(
    private readonly organizationProvider: OrganizationProvider,
    private readonly publicEventPublisher: OrganizationPublicEventPublisher,
  ) {}

  async list(context: OrganizationActorContext): Promise<OrganizationList> {
    return {
      items: await this.organizationProvider.listForActor(context),
    };
  }

  create(
    context: OrganizationActorContext,
    input: CreateOrganizationInput,
  ): Promise<OrganizationAccess> {
    return this.organizationProvider.createForActor(context, input);
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
      await this.organizationProvider.setActive(context, null);
      return { activeOrganization: null };
    }

    return {
      activeOrganization: await this.organizationProvider.setActive(
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
    await this.publishAuthorizationChanged({
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
    await this.publishAuthorizationChanged({
      organizationId,
      userId: target.userId,
      reason: 'member-removed',
    });
  }

  private async publishAuthorizationChanged(
    event: Parameters<
      OrganizationPublicEventPublisher['publishAuthorizationChanged']
    >[0],
  ): Promise<void> {
    try {
      await this.publicEventPublisher.publishAuthorizationChanged(event);
    } catch (error) {
      this.logger.error(
        `조직 권한 invalidation event 발행에 실패했습니다: organization=${event.organizationId}, user=${event.userId}`,
        error,
      );
    }
  }
}
