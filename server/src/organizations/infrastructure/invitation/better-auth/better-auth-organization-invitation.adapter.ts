import { Injectable } from '@nestjs/common';

import { ApplicationError } from '@/application.error';
import type { Auth } from '@/auth/auth';
import {
  OrganizationAccessDeniedError,
  OrganizationInvitationAccessDeniedError,
  OrganizationInvitationInvalidStateError,
  OrganizationInvitationNotFoundError,
  OrganizationInvitationUnavailableError,
  OrganizationNotFoundError,
  OrganizationProviderFailureError,
} from '@/organizations/domain/organization.error';
import type {
  OrganizationInvitation,
  OrganizationInvitationDetail,
} from '@/organizations/domain/organization-invitation';
import {
  OrganizationInvitationDetailSchema,
  OrganizationInvitationSchema,
} from '@/organizations/domain/organization-invitation';
import {
  getTeamspaceOrganizationAdapter,
  type TeamspaceOrganizationAuth,
} from '@/organizations/infrastructure/better-auth/teamspace-organization.adapter';
import {
  type CreateOrganizationInvitationProviderInput,
  OrganizationInvitationProvider,
  type ResendOrganizationInvitationProviderInput,
} from '@/organizations/infrastructure/invitation/organization-invitation.provider';
import type { OrganizationActorContext } from '@/organizations/infrastructure/organization/organization.provider';

import { AuthService } from '@thallesp/nestjs-better-auth';

const defaultInvitationLimit = 100;
const defaultMembershipLimit = 100;
const defaultInvitationExpiresInSeconds = 60 * 60 * 48;

type AuthApi = Auth['api'];
type AuthContext = Awaited<TeamspaceOrganizationAuth['$context']>;
type AuthInvitation = Awaited<ReturnType<AuthApi['createInvitation']>>;

@Injectable()
export class BetterAuthOrganizationInvitationAdapter extends OrganizationInvitationProvider {
  constructor(
    private readonly authService: AuthService<TeamspaceOrganizationAuth>,
  ) {
    super();
  }

  async create(
    context: OrganizationActorContext,
    input: CreateOrganizationInvitationProviderInput,
  ): Promise<OrganizationInvitation> {
    return this.call(async () => {
      const { authContext, adapter } = await this.organizationAdapter();
      const email = input.email.toLowerCase();
      const [inviter, actorMember, organization, recipientMember, pending] =
        await Promise.all([
          authContext.internalAdapter.findUserById(context.userId),
          adapter.findMemberByOrgId({
            userId: context.userId,
            organizationId: input.organizationId,
          }),
          adapter.findOrganizationById(input.organizationId),
          adapter.findMemberByEmail({
            email,
            organizationId: input.organizationId,
          }),
          adapter.findPendingInvitation({
            email,
            organizationId: input.organizationId,
          }),
        ]);

      if (!inviter) {
        throw new OrganizationProviderFailureError();
      }
      if (!actorMember || !organization) {
        throw new OrganizationNotFoundError();
      }
      if (actorMember.role === 'member') {
        throw new OrganizationAccessDeniedError();
      }
      if (recipientMember || pending.length > 0) {
        throw new OrganizationInvitationUnavailableError();
      }

      const pendingInvitations = await adapter.findPendingInvitations({
        organizationId: input.organizationId,
      });
      if (pendingInvitations.length >= defaultInvitationLimit) {
        throw new OrganizationInvitationUnavailableError();
      }

      const invitation = await adapter.createInvitation({
        invitation: {
          email,
          role: input.role,
          organizationId: input.organizationId,
          teamIds: [],
        },
        user: inviter,
      });

      return this.mapInvitation(invitation);
    });
  }

  async getForRecipient(
    context: OrganizationActorContext,
    invitationId: string,
  ): Promise<OrganizationInvitationDetail> {
    return this.call(async () => {
      const { authContext, adapter } = await this.organizationAdapter();
      const [recipient, invitation] = await Promise.all([
        authContext.internalAdapter.findUserById(context.userId),
        adapter.findInvitationById(invitationId),
      ]);

      if (
        !recipient ||
        !invitation ||
        invitation.status !== 'pending' ||
        invitation.expiresAt < new Date()
      ) {
        throw new OrganizationInvitationNotFoundError();
      }
      if (invitation.email.toLowerCase() !== recipient.email.toLowerCase()) {
        throw new OrganizationInvitationAccessDeniedError();
      }

      const [organization, inviterMember] = await Promise.all([
        adapter.findOrganizationById(invitation.organizationId),
        adapter.findMemberByOrgId({
          userId: invitation.inviterId,
          organizationId: invitation.organizationId,
        }),
      ]);
      if (!organization) {
        throw new OrganizationNotFoundError();
      }
      if (!inviterMember) {
        throw new OrganizationInvitationInvalidStateError();
      }

      return OrganizationInvitationDetailSchema.parse({
        ...this.mapInvitation(invitation),
        organizationName: organization.name,
        organizationSlug: organization.slug,
        inviterEmail: inviterMember.user.email,
      });
    });
  }

  async listForOrganization(
    context: OrganizationActorContext,
    organizationId: string,
  ): Promise<OrganizationInvitation[]> {
    return this.call(async () => {
      const { adapter } = await this.organizationAdapter();
      const member = await adapter.findMemberByOrgId({
        userId: context.userId,
        organizationId,
      });
      if (!member) {
        throw new OrganizationAccessDeniedError();
      }

      const invitations = await adapter.listInvitations({ organizationId });
      return invitations.map((invitation) => this.mapInvitation(invitation));
    });
  }

  async accept(
    context: OrganizationActorContext,
    invitationId: string,
  ): Promise<OrganizationInvitation> {
    return this.call(async () => {
      const { authContext, adapter } = await this.organizationAdapter();
      const [recipient, invitation] = await Promise.all([
        authContext.internalAdapter.findUserById(context.userId),
        adapter.findInvitationById(invitationId),
      ]);

      if (
        !recipient ||
        !invitation ||
        invitation.status !== 'pending' ||
        invitation.expiresAt < new Date()
      ) {
        throw new OrganizationInvitationNotFoundError();
      }
      if (invitation.email.toLowerCase() !== recipient.email.toLowerCase()) {
        throw new OrganizationInvitationAccessDeniedError();
      }

      const [organization, membersCount, existingMember] = await Promise.all([
        adapter.findOrganizationById(invitation.organizationId),
        adapter.countMembers({ organizationId: invitation.organizationId }),
        adapter.findMemberByOrgId({
          userId: context.userId,
          organizationId: invitation.organizationId,
        }),
      ]);
      if (!organization) {
        throw new OrganizationNotFoundError();
      }
      if (existingMember || membersCount >= defaultMembershipLimit) {
        throw new OrganizationInvitationInvalidStateError();
      }

      const accepted = await adapter.updateInvitation({
        invitationId,
        status: 'accepted',
        fromStatus: 'pending',
      });
      if (!accepted) {
        throw new OrganizationInvitationNotFoundError();
      }

      try {
        await adapter.createMember({
          organizationId: accepted.organizationId,
          userId: context.userId,
          role: accepted.role,
          createdAt: new Date(),
        });
      } catch (error) {
        await adapter.updateInvitation({
          invitationId,
          status: 'pending',
          fromStatus: 'accepted',
        });
        throw error;
      }

      return this.mapInvitation(accepted);
    });
  }

  async reject(
    context: OrganizationActorContext,
    invitationId: string,
  ): Promise<OrganizationInvitation> {
    return this.call(async () => {
      const { authContext, adapter } = await this.organizationAdapter();
      const [recipient, invitation] = await Promise.all([
        authContext.internalAdapter.findUserById(context.userId),
        adapter.findInvitationById(invitationId),
      ]);

      if (!recipient || !invitation || invitation.status !== 'pending') {
        throw new OrganizationInvitationNotFoundError();
      }
      if (invitation.email.toLowerCase() !== recipient.email.toLowerCase()) {
        throw new OrganizationInvitationAccessDeniedError();
      }

      const rejected = await adapter.updateInvitation({
        invitationId,
        status: 'rejected',
        fromStatus: 'pending',
      });
      if (!rejected) {
        throw new OrganizationInvitationInvalidStateError();
      }

      return this.mapInvitation(rejected);
    });
  }

  async cancel(
    context: OrganizationActorContext,
    invitationId: string,
  ): Promise<void> {
    await this.call(async () => {
      const { adapter } = await this.organizationAdapter();
      const invitation = await adapter.findInvitationById(invitationId);
      if (!invitation) {
        throw new OrganizationInvitationNotFoundError();
      }

      const actorMember = await adapter.findMemberByOrgId({
        userId: context.userId,
        organizationId: invitation.organizationId,
      });
      if (!actorMember || actorMember.role === 'member') {
        throw new OrganizationAccessDeniedError();
      }

      const canceled = await adapter.updateInvitation({
        invitationId,
        status: 'canceled',
        fromStatus: 'pending',
      });
      if (!canceled) {
        throw new OrganizationInvitationInvalidStateError();
      }
    });
  }

  async resend(
    context: OrganizationActorContext,
    input: ResendOrganizationInvitationProviderInput,
  ): Promise<OrganizationInvitation> {
    return this.call(async () => {
      const { authContext, adapter } = await this.organizationAdapter();
      const invitation = await adapter.findInvitationById(
        input.expectedInvitationId,
      );
      if (
        !invitation ||
        invitation.status !== 'pending' ||
        invitation.organizationId !== input.organizationId ||
        invitation.email.toLowerCase() !== input.email.toLowerCase() ||
        invitation.role !== input.role
      ) {
        throw new OrganizationInvitationInvalidStateError();
      }

      const actorMember = await adapter.findMemberByOrgId({
        userId: context.userId,
        organizationId: input.organizationId,
      });
      if (!actorMember || actorMember.role === 'member') {
        throw new OrganizationAccessDeniedError();
      }

      const expiresAt = new Date(
        Date.now() + defaultInvitationExpiresInSeconds * 1000,
      );
      const updated = await authContext.adapter.update({
        model: 'invitation',
        where: [
          { field: 'id', value: input.expectedInvitationId },
          { field: 'status', value: 'pending' },
        ],
        update: { expiresAt },
      });
      if (!updated) {
        throw new OrganizationInvitationInvalidStateError();
      }

      const refreshed = await adapter.findInvitationById(
        input.expectedInvitationId,
      );
      if (!refreshed) {
        throw new OrganizationProviderFailureError();
      }
      return this.mapInvitation(refreshed);
    });
  }

  private async organizationAdapter(): Promise<{
    authContext: AuthContext;
    adapter: ReturnType<typeof getTeamspaceOrganizationAdapter>;
  }> {
    const authContext = await this.authService.instance.$context;
    return {
      authContext,
      adapter: getTeamspaceOrganizationAdapter(authContext),
    };
  }

  private mapInvitation(invitation: AuthInvitation): OrganizationInvitation {
    return OrganizationInvitationSchema.parse({
      id: invitation.id,
      organizationId: invitation.organizationId,
      email: invitation.email,
      role: invitation.role,
      status: invitation.status,
      inviterId: invitation.inviterId,
      expiresAt: invitation.expiresAt,
      createdAt: invitation.createdAt,
    });
  }

  private async call<T>(execute: () => Promise<T>): Promise<T> {
    try {
      return await execute();
    } catch (error) {
      if (error instanceof ApplicationError) throw error;
      throw new OrganizationProviderFailureError({ cause: error });
    }
  }
}
