import { Inject, Injectable } from '@nestjs/common';

import { AuthUserDirectoryService } from '#server/auth/auth-user-directory.service.js';
import { ChatService } from '#server/chat/chat.service.js';
import {
  OrganizationInvitationCompensationFailureError,
  OrganizationInvitationDeliveryFailureError,
  OrganizationInvitationUnavailableError,
  OrganizationMemberNotFoundError,
  OrganizationNotFoundError,
} from '#server/organizations/domain/organization.error.js';
import type { OrganizationAccess } from '#server/organizations/domain/organization-access.js';
import type { OrganizationMember } from '#server/organizations/domain/organization-member.js';
import {
  assertInvitationCreateAllowed,
  assertMemberRemovalAllowed,
  assertMemberRoleChangeAllowed,
} from '#server/organizations/domain/organization-policy.js';
import type { ActiveOrganization } from '#server/organizations/dto/active-organization.dto.js';
import type { CreateOrganizationInput } from '#server/organizations/dto/create-organization.dto.js';
import type { CreateOrganizationInvitationInput } from '#server/organizations/dto/create-organization-invitation.dto.js';
import type { OrganizationInvitationResponse } from '#server/organizations/dto/organization-invitation.dto.js';
import { toOrganizationInvitationResponse } from '#server/organizations/dto/organization-invitation.dto.js';
import type { OrganizationList } from '#server/organizations/dto/organization-list.dto.js';
import type { OrganizationMemberList } from '#server/organizations/dto/organization-member-list.dto.js';
import type { QueryOrganizationMembersInput } from '#server/organizations/dto/query-organization-members.dto.js';
import type { SetActiveOrganizationInput } from '#server/organizations/dto/set-active-organization.dto.js';
import type { UpdateOrganizationMemberRoleInput } from '#server/organizations/dto/update-organization-member-role.dto.js';
import { OrganizationInvitationProvider } from '#server/organizations/infrastructure/invitation/organization-invitation.provider.js';
import {
  type OrganizationActorContext,
  OrganizationProvider,
} from '#server/organizations/infrastructure/organization/organization.provider.js';

type OrganizationInvitationDelivery = Pick<
  ChatService,
  'deliverOrganizationInvitation'
>;

type OrganizationUserDirectory = Pick<
  AuthUserDirectoryService,
  'resolveExactUsername'
>;

@Injectable()
export class OrganizationsService {
  constructor(
    private readonly organizationProvider: OrganizationProvider,
    private readonly invitationProvider: OrganizationInvitationProvider,
    @Inject(AuthUserDirectoryService)
    private readonly userDirectory: OrganizationUserDirectory,
    @Inject(ChatService)
    private readonly chatService: OrganizationInvitationDelivery,
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

  async createInvitation(
    context: OrganizationActorContext,
    organizationId: string,
    input: CreateOrganizationInvitationInput,
  ): Promise<OrganizationInvitationResponse> {
    const access = await this.organizationProvider.getAccess(
      context,
      organizationId,
    );
    assertInvitationCreateAllowed(access.role);

    const recipient = await this.userDirectory.resolveExactUsername(
      input.recipientUsername,
    );
    if (!recipient) {
      throw new OrganizationInvitationUnavailableError();
    }

    const invitation = await this.invitationProvider.create(context, {
      organizationId,
      email: recipient.email,
      role: input.role,
    });

    try {
      await this.chatService.deliverOrganizationInvitation({
        recipientUserId: recipient.id,
        invitationId: invitation.id,
        organizationId,
        inviterUserId: context.userId,
        organizationNameAtSend: access.organization.name,
      });
    } catch (deliveryError) {
      try {
        await this.invitationProvider.cancel(context, invitation.id);
      } catch (compensationError) {
        throw new OrganizationInvitationCompensationFailureError(
          invitation.id,
          {
            cause: new AggregateError([deliveryError, compensationError]),
          },
        );
      }

      throw new OrganizationInvitationDeliveryFailureError(invitation.id, {
        cause: deliveryError,
      });
    }

    return toOrganizationInvitationResponse(invitation);
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

    return this.organizationProvider.changeMemberRole(
      context,
      organizationId,
      target,
      input.role,
    );
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
  }
}
