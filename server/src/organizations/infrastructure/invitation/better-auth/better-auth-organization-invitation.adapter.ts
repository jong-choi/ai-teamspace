import { Injectable } from '@nestjs/common';

import { ApplicationError } from '#server/application.error.js';
import type { Auth } from '#server/auth/auth.js';
import { organizationPlugin } from '#server/auth/auth-options.js';
import {
  OrganizationAccessDeniedError,
  OrganizationInvitationUnavailableError,
  OrganizationNotFoundError,
  OrganizationProviderFailureError,
} from '#server/organizations/domain/organization.error.js';
import type { OrganizationInvitation } from '#server/organizations/domain/organization-invitation.js';
import { OrganizationInvitationSchema } from '#server/organizations/domain/organization-invitation.js';
import {
  type CreateOrganizationInvitationProviderInput,
  OrganizationInvitationProvider,
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

@Injectable()
export class BetterAuthOrganizationInvitationAdapter extends OrganizationInvitationProvider {
  constructor(private readonly authService: AuthService<Auth>) {
    super();
  }

  async create(
    context: OrganizationActorContext,
    input: CreateOrganizationInvitationProviderInput,
  ): Promise<OrganizationInvitation> {
    const invitation = await this.call(() =>
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

  async cancel(
    context: OrganizationActorContext,
    invitationId: string,
  ): Promise<void> {
    const canceled = await this.call(() =>
      this.authService.api.cancelInvitation({
        body: { invitationId },
        headers: this.headers(context),
      }),
    );

    if (!canceled) {
      throw new OrganizationProviderFailureError();
    }
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
      code === errors.USER_IS_ALREADY_A_MEMBER_OF_THIS_ORGANIZATION.code ||
      code === errors.USER_IS_ALREADY_INVITED_TO_THIS_ORGANIZATION.code
    ) {
      return new OrganizationInvitationUnavailableError({ cause: error });
    }

    if (
      code === errors.ORGANIZATION_NOT_FOUND.code ||
      code === errors.USER_IS_NOT_A_MEMBER_OF_THE_ORGANIZATION.code ||
      code === errors.YOU_ARE_NOT_A_MEMBER_OF_THIS_ORGANIZATION.code
    ) {
      return new OrganizationNotFoundError({ cause: error });
    }

    if (
      code ===
        errors.YOU_ARE_NOT_ALLOWED_TO_INVITE_USERS_TO_THIS_ORGANIZATION.code ||
      code === errors.YOU_ARE_NOT_ALLOWED_TO_INVITE_USER_WITH_THIS_ROLE.code ||
      code === errors.YOU_ARE_NOT_ALLOWED_TO_CANCEL_THIS_INVITATION.code
    ) {
      return new OrganizationAccessDeniedError({ cause: error });
    }

    return new OrganizationProviderFailureError({ cause: error });
  }
}
