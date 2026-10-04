import { Injectable } from '@nestjs/common';

import { ApplicationError } from '#server/application.error.js';
import type { Auth } from '#server/auth/auth.js';
import { organizationPlugin } from '#server/auth/auth-options.js';
import {
  OrganizationAccessDeniedError,
  OrganizationInvitationAccessDeniedError,
  OrganizationInvitationInvalidStateError,
  OrganizationInvitationNotFoundError,
  OrganizationInvitationUnavailableError,
  OrganizationNotFoundError,
  OrganizationProviderFailureError,
} from '#server/organizations/domain/organization.error.js';
import type {
  OrganizationInvitation,
  OrganizationInvitationDetail,
} from '#server/organizations/domain/organization-invitation.js';
import {
  OrganizationInvitationDetailSchema,
  OrganizationInvitationSchema,
} from '#server/organizations/domain/organization-invitation.js';
import {
  type CreateOrganizationInvitationProviderInput,
  OrganizationInvitationProvider,
  type ResendOrganizationInvitationProviderInput,
} from '#server/organizations/infrastructure/invitation/organization-invitation.provider.js';
import type { OrganizationActorContext } from '#server/organizations/infrastructure/organization/organization.provider.js';

import { AuthService } from '@thallesp/nestjs-better-auth';
import { APIError } from 'better-auth';
import { fromNodeHeaders } from 'better-auth/node';
import { z } from 'zod';

const credentialSchema = z.record(
  z.string(),
  z.union([z.string(), z.array(z.string()), z.undefined()]),
);

type AuthApi = Auth['api'];
type AuthInvitation = Awaited<ReturnType<AuthApi['createInvitation']>>;
type AuthInvitationDetail = Awaited<ReturnType<AuthApi['getInvitation']>>;
type InvitationOperation =
  'create' | 'get' | 'list' | 'accept' | 'reject' | 'cancel' | 'resend';

@Injectable()
export class BetterAuthOrganizationInvitationAdapter extends OrganizationInvitationProvider {
  constructor(private readonly authService: AuthService<Auth>) {
    super();
  }

  async create(
    context: OrganizationActorContext,
    input: CreateOrganizationInvitationProviderInput,
  ): Promise<OrganizationInvitation> {
    const invitation = await this.callBetterAuth('create', () =>
      this.authService.api.createInvitation({
        body: {
          email: input.email,
          role: input.role,
          organizationId: input.organizationId,
        },
        headers: this.headers(context),
      }),
    );

    return this.mapInvitation(invitation);
  }

  async getForRecipient(
    context: OrganizationActorContext,
    invitationId: string,
  ): Promise<OrganizationInvitationDetail> {
    const invitation = await this.callBetterAuth('get', () =>
      this.authService.api.getInvitation({
        query: { id: invitationId },
        headers: this.headers(context),
      }),
    );

    return this.mapInvitationDetail(invitation);
  }

  async listForOrganization(
    context: OrganizationActorContext,
    organizationId: string,
  ): Promise<OrganizationInvitation[]> {
    const invitations = await this.callBetterAuth('list', () =>
      this.authService.api.listInvitations({
        query: { organizationId },
        headers: this.headers(context),
      }),
    );

    return invitations.map((invitation) => this.mapInvitation(invitation));
  }

  async accept(
    context: OrganizationActorContext,
    invitationId: string,
  ): Promise<OrganizationInvitation> {
    const result = await this.callBetterAuth('accept', () =>
      this.authService.api.acceptInvitation({
        body: { invitationId },
        headers: this.headers(context),
      }),
    );

    return this.mapInvitation(result.invitation);
  }

  async reject(
    context: OrganizationActorContext,
    invitationId: string,
  ): Promise<OrganizationInvitation> {
    const result = await this.callBetterAuth('reject', () =>
      this.authService.api.rejectInvitation({
        body: { invitationId },
        headers: this.headers(context),
      }),
    );

    if (!result.invitation) {
      throw new OrganizationInvitationInvalidStateError();
    }
    return this.mapInvitation(result.invitation);
  }

  async cancel(
    context: OrganizationActorContext,
    invitationId: string,
  ): Promise<void> {
    const canceled = await this.callBetterAuth('cancel', () =>
      this.authService.api.cancelInvitation({
        body: { invitationId },
        headers: this.headers(context),
      }),
    );

    if (!canceled) {
      throw new OrganizationInvitationNotFoundError();
    }
  }

  async resend(
    context: OrganizationActorContext,
    input: ResendOrganizationInvitationProviderInput,
  ): Promise<OrganizationInvitation> {
    const invitation = await this.callBetterAuth('resend', () =>
      this.authService.api.createInvitation({
        body: {
          email: input.email,
          role: input.role,
          organizationId: input.organizationId,
          resend: true,
        },
        headers: this.headers(context),
      }),
    );

    if (invitation.id !== input.expectedInvitationId) {
      throw new OrganizationProviderFailureError();
    }
    return this.mapInvitation(invitation);
  }

  private headers(context: OrganizationActorContext) {
    return fromNodeHeaders(credentialSchema.parse(context.providerCredential));
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

  private mapInvitationDetail(
    invitation: AuthInvitationDetail,
  ): OrganizationInvitationDetail {
    return OrganizationInvitationDetailSchema.parse({
      ...this.mapInvitation(invitation),
      organizationName: invitation.organizationName,
      organizationSlug: invitation.organizationSlug,
      inviterEmail: invitation.inviterEmail,
    });
  }

  private async callBetterAuth<T>(
    operation: InvitationOperation,
    execute: () => Promise<T>,
  ): Promise<T> {
    try {
      return await execute();
    } catch (error) {
      if (error instanceof ApplicationError) throw error;
      if (error instanceof APIError) {
        throw this.mapApiError(operation, error);
      }
      throw new OrganizationProviderFailureError({ cause: error });
    }
  }

  private mapApiError(
    operation: InvitationOperation,
    error: APIError,
  ): ApplicationError {
    const code = error.body?.code;
    const errors = organizationPlugin.$ERROR_CODES;

    if (
      code === errors.USER_IS_ALREADY_A_MEMBER_OF_THIS_ORGANIZATION.code ||
      code === errors.USER_IS_ALREADY_INVITED_TO_THIS_ORGANIZATION.code ||
      code === errors.INVITATION_LIMIT_REACHED.code
    ) {
      return new OrganizationInvitationUnavailableError({ cause: error });
    }

    if (code === errors.INVITATION_NOT_FOUND.code) {
      return new OrganizationInvitationNotFoundError({ cause: error });
    }

    if (
      code === errors.YOU_ARE_NOT_THE_RECIPIENT_OF_THE_INVITATION.code ||
      code ===
        errors
          .EMAIL_VERIFICATION_REQUIRED_BEFORE_ACCEPTING_OR_REJECTING_INVITATION
          .code ||
      code === errors.EMAIL_VERIFICATION_REQUIRED_FOR_INVITATION.code
    ) {
      return new OrganizationInvitationAccessDeniedError({ cause: error });
    }

    if (
      code === errors.INVITER_IS_NO_LONGER_A_MEMBER_OF_THE_ORGANIZATION.code ||
      code === errors.ORGANIZATION_MEMBERSHIP_LIMIT_REACHED.code
    ) {
      return new OrganizationInvitationInvalidStateError({ cause: error });
    }

    if (
      code === errors.ORGANIZATION_NOT_FOUND.code ||
      code === errors.USER_IS_NOT_A_MEMBER_OF_THE_ORGANIZATION.code ||
      code === errors.YOU_ARE_NOT_A_MEMBER_OF_THIS_ORGANIZATION.code
    ) {
      return new OrganizationNotFoundError({ cause: error });
    }

    if (
      code === errors.MEMBER_NOT_FOUND.code ||
      code ===
        errors.YOU_ARE_NOT_ALLOWED_TO_INVITE_USERS_TO_THIS_ORGANIZATION.code ||
      code === errors.YOU_ARE_NOT_ALLOWED_TO_INVITE_USER_WITH_THIS_ROLE.code ||
      code === errors.YOU_ARE_NOT_ALLOWED_TO_CANCEL_THIS_INVITATION.code
    ) {
      return new OrganizationAccessDeniedError({ cause: error });
    }

    if (operation === 'get' && error.status === 'BAD_REQUEST' && !code) {
      return new OrganizationInvitationNotFoundError({ cause: error });
    }

    if (operation === 'list' && error.status === 'FORBIDDEN' && !code) {
      return new OrganizationAccessDeniedError({ cause: error });
    }

    return new OrganizationProviderFailureError({ cause: error });
  }
}
