import { Inject, Injectable } from '@nestjs/common';

import { AuthUserDirectoryService } from '#server/auth/auth-user-directory.service.js';
import { ChatService } from '#server/chat/chat.service.js';
import {
  OrganizationInvitationCompensationFailureError,
  OrganizationInvitationDeliveryFailureError,
  OrganizationInvitationInvalidStateError,
  OrganizationInvitationNotFoundError,
  OrganizationInvitationUnavailableError,
} from '#server/organizations/domain/organization.error.js';
import type { OrganizationAccess } from '#server/organizations/domain/organization-access.js';
import type { OrganizationInvitation } from '#server/organizations/domain/organization-invitation.js';
import { assertInvitationAdminAllowed } from '#server/organizations/domain/organization-policy.js';
import type { CreateOrganizationInvitationInput } from '#server/organizations/dto/create-organization-invitation.dto.js';
import type { OrganizationInvitationResponse } from '#server/organizations/dto/organization-invitation.dto.js';
import { toOrganizationInvitationResponse } from '#server/organizations/dto/organization-invitation.dto.js';
import type { OrganizationInvitationDetailResponse } from '#server/organizations/dto/organization-invitation-detail.dto.js';
import { toOrganizationInvitationDetailResponse } from '#server/organizations/dto/organization-invitation-detail.dto.js';
import type { OrganizationInvitationList } from '#server/organizations/dto/organization-invitation-list.dto.js';
import { toOrganizationInvitationListItem } from '#server/organizations/dto/organization-invitation-list.dto.js';
import type { QueryOrganizationInvitationsInput } from '#server/organizations/dto/query-organization-invitations.dto.js';
import { OrganizationInvitationProvider } from '#server/organizations/infrastructure/invitation/organization-invitation.provider.js';
import {
  type OrganizationActorContext,
  OrganizationProvider,
} from '#server/organizations/infrastructure/organization/organization.provider.js';

type OrganizationInvitationDelivery = Pick<
  ChatService,
  'deliverOrganizationInvitation'
>;

type OrganizationInvitationUserDirectory = Pick<
  AuthUserDirectoryService,
  'resolveExactUsername' | 'findByIds' | 'findByEmails'
>;

@Injectable()
export class OrganizationInvitationsService {
  constructor(
    private readonly organizationProvider: OrganizationProvider,
    private readonly invitationProvider: OrganizationInvitationProvider,
    @Inject(AuthUserDirectoryService)
    private readonly userDirectory: OrganizationInvitationUserDirectory,
    @Inject(ChatService)
    private readonly chatService: OrganizationInvitationDelivery,
  ) {}

  async create(
    context: OrganizationActorContext,
    organizationId: string,
    input: CreateOrganizationInvitationInput,
  ): Promise<OrganizationInvitationResponse> {
    const access = await this.organizationProvider.getAccess(
      context,
      organizationId,
    );
    assertInvitationAdminAllowed(access.role);

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
      await this.compensateCreateFailure(context, invitation.id, deliveryError);
    }

    return toOrganizationInvitationResponse(invitation);
  }

  async list(
    context: OrganizationActorContext,
    organizationId: string,
    query: QueryOrganizationInvitationsInput,
  ): Promise<OrganizationInvitationList> {
    const access = await this.organizationProvider.getAccess(
      context,
      organizationId,
    );
    assertInvitationAdminAllowed(access.role);

    const invitations = (
      await this.invitationProvider.listForOrganization(context, organizationId)
    )
      .filter((invitation) => invitation.status === query.status)
      .sort(
        (left, right) => right.createdAt.getTime() - left.createdAt.getTime(),
      );
    const total = invitations.length;
    const page = invitations.slice(query.offset, query.offset + query.limit);

    const [recipients, inviters] = await Promise.all([
      this.userDirectory.findByEmails(
        page.map((invitation) => invitation.email),
      ),
      this.userDirectory.findByIds(
        page.map((invitation) => invitation.inviterId),
      ),
    ]);
    const recipientsByEmail = new Map(
      recipients.map((user) => [user.email.toLowerCase(), user]),
    );
    const invitersById = new Map(inviters.map((user) => [user.id, user]));

    return {
      items: page.map((invitation) =>
        toOrganizationInvitationListItem(
          invitation,
          recipientsByEmail.get(invitation.email.toLowerCase()),
          invitersById.get(invitation.inviterId),
        ),
      ),
      total,
      limit: query.limit,
      offset: query.offset,
    };
  }

  async get(
    context: OrganizationActorContext,
    invitationId: string,
  ): Promise<OrganizationInvitationDetailResponse> {
    const invitation = await this.invitationProvider.getForRecipient(
      context,
      invitationId,
    );
    const [inviter] = await this.userDirectory.findByIds([
      invitation.inviterId,
    ]);
    return toOrganizationInvitationDetailResponse(invitation, inviter);
  }

  async accept(
    context: OrganizationActorContext,
    invitationId: string,
  ): Promise<OrganizationInvitationResponse> {
    return toOrganizationInvitationResponse(
      await this.invitationProvider.accept(context, invitationId),
    );
  }

  async reject(
    context: OrganizationActorContext,
    invitationId: string,
  ): Promise<OrganizationInvitationResponse> {
    return toOrganizationInvitationResponse(
      await this.invitationProvider.reject(context, invitationId),
    );
  }

  async cancel(
    context: OrganizationActorContext,
    organizationId: string,
    invitationId: string,
  ): Promise<void> {
    const { invitation } = await this.requireAdminInvitation(
      context,
      organizationId,
      invitationId,
    );
    this.assertPending(invitation);
    await this.invitationProvider.cancel(context, invitationId);
  }

  async resend(
    context: OrganizationActorContext,
    organizationId: string,
    invitationId: string,
  ): Promise<OrganizationInvitationResponse> {
    const { access, invitation } = await this.requireAdminInvitation(
      context,
      organizationId,
      invitationId,
    );
    this.assertPending(invitation);
    if (invitation.role === 'owner') {
      throw new OrganizationInvitationInvalidStateError();
    }

    const [recipient] = await this.userDirectory.findByEmails([
      invitation.email,
    ]);
    if (!recipient) {
      throw new OrganizationInvitationUnavailableError();
    }

    const resent = await this.invitationProvider.resend(context, {
      expectedInvitationId: invitationId,
      organizationId,
      email: invitation.email,
      role: invitation.role,
    });

    try {
      await this.chatService.deliverOrganizationInvitation({
        recipientUserId: recipient.id,
        invitationId,
        organizationId,
        inviterUserId: invitation.inviterId,
        organizationNameAtSend: access.organization.name,
        republishExistingMessage: true,
      });
    } catch (error) {
      throw new OrganizationInvitationDeliveryFailureError(invitationId, {
        cause: error,
      });
    }

    return toOrganizationInvitationResponse(resent);
  }

  private async compensateCreateFailure(
    context: OrganizationActorContext,
    invitationId: string,
    deliveryError: unknown,
  ): Promise<never> {
    try {
      await this.invitationProvider.cancel(context, invitationId);
    } catch (compensationError) {
      throw new OrganizationInvitationCompensationFailureError(invitationId, {
        cause: new AggregateError([deliveryError, compensationError]),
      });
    }

    throw new OrganizationInvitationDeliveryFailureError(invitationId, {
      cause: deliveryError,
    });
  }

  private async requireAdminInvitation(
    context: OrganizationActorContext,
    organizationId: string,
    invitationId: string,
  ): Promise<{
    access: OrganizationAccess;
    invitation: OrganizationInvitation;
  }> {
    const access = await this.organizationProvider.getAccess(
      context,
      organizationId,
    );
    assertInvitationAdminAllowed(access.role);

    const invitations = await this.invitationProvider.listForOrganization(
      context,
      organizationId,
    );
    const invitation = invitations.find(
      (item) =>
        item.id === invitationId && item.organizationId === organizationId,
    );
    if (!invitation) {
      throw new OrganizationInvitationNotFoundError();
    }

    return { access, invitation };
  }

  private assertPending(invitation: OrganizationInvitation): void {
    if (invitation.status !== 'pending') {
      throw new OrganizationInvitationInvalidStateError();
    }
  }
}
