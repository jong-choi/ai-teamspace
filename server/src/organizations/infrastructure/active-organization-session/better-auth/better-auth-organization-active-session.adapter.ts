import type { IncomingHttpHeaders } from 'node:http';

import { Injectable } from '@nestjs/common';

import type { Auth } from '@/auth/auth';
import { OrganizationProviderFailureError } from '@/organizations/domain/organization.error';
import { OrganizationActiveSessionProvider } from '@/organizations/infrastructure/active-organization-session/organization-active-session.provider';

import { AuthService } from '@thallesp/nestjs-better-auth';
import { fromNodeHeaders } from 'better-auth/node';
import { z } from 'zod';

const headersSchema = z.record(
  z.string(),
  z.union([z.string(), z.array(z.string()), z.undefined()]),
);

@Injectable()
export class BetterAuthOrganizationActiveSessionAdapter extends OrganizationActiveSessionProvider {
  constructor(private readonly authService: AuthService<Auth>) {
    super();
  }

  async setActive(
    headers: IncomingHttpHeaders,
    organizationId: string | null,
  ): Promise<void> {
    try {
      await this.authService.api.setActiveOrganization({
        body: { organizationId },
        headers: fromNodeHeaders(headersSchema.parse(headers)),
      });
    } catch (error) {
      throw new OrganizationProviderFailureError({ cause: error });
    }
  }
}
