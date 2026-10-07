import { Injectable } from '@nestjs/common';

import type { AgentActor } from '@/agent/domain/agent-actor';
import {
  AgentIdentityProvider,
  AgentOrganizationContextRequiredError,
} from '@/agent/infrastructure/auth/agent-identity.provider';
import type { Auth } from '@/auth/auth';
import { OrganizationMembershipService } from '@/organizations/organization-membership.service';

import { AuthService } from '@thallesp/nestjs-better-auth';

@Injectable()
export class BetterAuthAgentIdentityAdapter extends AgentIdentityProvider {
  constructor(
    private readonly authService: AuthService<Auth>,
    private readonly memberships: OrganizationMembershipService,
  ) {
    super();
  }

  async resolve(request: Request): Promise<AgentActor | null> {
    const session = await this.authService.api.getSession({
      headers: request.headers,
    });
    if (!session) return null;

    const organizationId = session.session.activeOrganizationId;
    if (
      !organizationId ||
      !(await this.memberships.hasMemberUser(organizationId, session.user.id))
    ) {
      throw new AgentOrganizationContextRequiredError();
    }

    return {
      userId: session.user.id,
      organizationId,
      displayName: session.user.name,
      permissions: [],
    };
  }
}
